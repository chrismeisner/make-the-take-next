import Airtable from 'airtable';
import { sumTakePoints, isVisibleTake } from '../../../lib/points';
import { aggregateTakeStats } from '../../../lib/leaderboard';
import { getDataBackend } from '../../../lib/runtimeConfig';
import { createRepositories } from '../../../lib/dal/factory';
import { query } from '../../../lib/db/postgres';

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY })
  .base(process.env.AIRTABLE_BASE_ID);

// Cache creator leaderboard for 12 hours per profile
const CREATOR_LEADERBOARD_TTL_MS = 12 * 60 * 60 * 1000;
const creatorLeaderboardCache = new Map(); // key: profileID -> { leaderboard, updatedAtMs }

export default async function handler(req, res) {
  // Only allow GET requests
  if (req.method !== 'GET') {
	return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { profileID } = req.query;
  const includeExchanges = String(req.query.includeExchanges || '').toLowerCase() === '1' || String(req.query.includeExchanges || '').toLowerCase() === 'true';
  const refreshBypass = String(req.query.refresh || '').toLowerCase() === '1' || String(req.query.refresh || '').toLowerCase() === 'true';
  const select = String(req.query.select || '').toLowerCase();

  try {
	// Fast path: tokens-only
	if (select === 'tokens') {
	  const isPG = getDataBackend() === 'postgres';
	  if (isPG) {
		let tokensEarned = 0;
		let tokensSpent = 0;
		try {
		  const { rows } = await query(
			`SELECT COALESCE(SUM(t.tokens),0) AS earned
			   FROM takes t
			   JOIN profiles p ON p.mobile_e164 = t.take_mobile
			  WHERE p.profile_id = $1 AND t.take_status = 'latest'`,
			[profileID]
		  );
		  tokensEarned = Number(rows?.[0]?.earned) || 0;
		} catch {}
		try {
		  const { rows } = await query(
			`SELECT COALESCE(SUM(e.exchange_tokens),0) AS spent
			   FROM exchanges e
			   JOIN profiles p ON e.profile_id = p.id
			  WHERE p.profile_id = $1`,
			[profileID]
		  );
		  tokensSpent = Number(rows?.[0]?.spent) || 0;
		} catch {}
		const tokensBalance = tokensEarned - tokensSpent;
		return res.status(200).json({ success: true, tokensEarned, tokensSpent, tokensBalance });
	  }
	  // Airtable fallback (less efficient but scoped)
	  let tokensEarned = 0;
	  let tokensSpent = 0;
	  try {
		const found = await base('Profiles')
		  .select({ filterByFormula: `{profileID}="${profileID}"`, maxRecords: 1 })
		  .all();
		if (!found.length) {
		  return res.status(404).json({ success: false, error: 'Profile not found' });
		}
		const pf = found[0].fields || {};
		const phone = pf.profileMobile;
		if (phone) {
		  const filterByFormula = `AND({takeMobile} = "${phone}", {takeStatus} = "latest")`;
		  const takes = await base('Takes').select({ filterByFormula, maxRecords: 5000 }).all();
		  const totalPoints = sumTakePoints(takes);
		  tokensEarned = Math.floor(totalPoints * 0.2);
		}
		const exchFilter = `{profileID}="${profileID}"`;
		const exchRecs = await base('Exchanges').select({ filterByFormula: exchFilter, maxRecords: 5000 }).all();
		tokensSpent = exchRecs.reduce((sum, r) => sum + (Number(r.fields?.exchangeTokens) || 0), 0);
	  } catch {}
	  const tokensBalance = tokensEarned - tokensSpent;
	  return res.status(200).json({ success: true, tokensEarned, tokensSpent, tokensBalance });
	}

	// 1) Fetch the profile record (Prefer Postgres when enabled)
	let profRec = null;
	let pf = null;
	let profileTeamData = null;
	const isPG = getDataBackend() === 'postgres';
	if (isPG) {
	  const { profiles } = createRepositories();
	  const r = await profiles.getByProfileID(profileID);
	  if (!r) {
		return res.status(404).json({ success: false, error: 'Profile not found' });
	  }
	  // Synthesize structures expected later in the file
	  profRec = { id: r.id, _rawJson: { createdTime: r.created_at ? new Date(r.created_at).toISOString() : null } };
	  pf = {
		profileID: r.profile_id,
		profileMobile: r.mobile_e164,
		profileUsername: r.profile_id || '',
		profileAvatar: [],
	  };
	  // Resolve favorite team via Postgres if present
	  if (r.favorite_team_id) {
		try {
		  const { rows } = await query('SELECT id, team_id, team_slug, name, logo_url FROM teams WHERE id = $1 LIMIT 1', [r.favorite_team_id]);
		  if (rows.length) {
			const t = rows[0];
			profileTeamData = {
			  airtableId: t.id,
			  teamID: t.team_id || t.id,
			  teamName: t.name || '',
			  teamLogo: t.logo_url ? [{ url: t.logo_url, filename: 'team-logo' }] : [],
			};
		  }
		} catch {}
	  }
	} else {
	  const found = await base('Profiles')
		.select({ filterByFormula: `{profileID}="${profileID}"`, maxRecords: 1 })
		.all();
	  if (found.length === 0) {
		return res.status(404).json({ success: false, error: 'Profile not found' });
	  }
	  profRec = found[0];
	  pf = profRec.fields;
	}

	// Initialize arrays to hold user's takes & packs
	let userTakes = [];
	let userPackIDs = [];
	let totalPoints = 0;

	// 2) Fetch takes
	if (!isPG && Array.isArray(pf.Takes) && pf.Takes.length > 0) {
	  // Build a filter formula to fetch all takes linked to this profile
	  const filterByFormula = `OR(${pf.Takes.map((id) => `RECORD_ID()='${id}'`).join(',')})`;
	  const takeRecords = await base('Takes')
		.select({ filterByFormula, maxRecords: 5000 })
		.all();

	  // Compute total points ignoring overwritten/hidden takes
	  totalPoints = sumTakePoints(takeRecords);
	  // Filter out any takes that have been overwritten
	  userTakes = takeRecords
		.filter(isVisibleTake)
		.map((t) => {
		  const tf = t.fields;
		  // Collect linked pack IDs from the take
		  const packIDs = tf.packID || [];
		  userPackIDs.push(...packIDs);
		  let contentImageUrls = [];
		  if (Array.isArray(tf.contentImage)) {
			contentImageUrls = tf.contentImage.map((att) => att.url);
		  }
		  return {
			airtableRecordId: t.id,
			takeID: tf.TakeID || t.id,
			propID: tf.propID || '',
			propSide: tf.propSide || null,
			propTitle: tf.propTitle || '',
			subjectTitle: tf.subjectTitle || '',
			takePopularity: tf.takePopularity || 0,
			createdTime: t._rawJson.createdTime,
			takeStatus: tf.takeStatus || '',
			propResult: Array.isArray(tf.propResult) ? tf.propResult[0] : tf.propResult || '',
			propEventMatchup: Array.isArray(tf.propEventMatchup) ? tf.propEventMatchup[0] : tf.propEventMatchup || '',
			propLeague: Array.isArray(tf.propLeague) ? tf.propLeague[0] : tf.propLeague || '',
			propESPN: Array.isArray(tf.propESPN) ? tf.propESPN[0] : tf.propESPN || '',
			propStatus: Array.isArray(tf.propStatus) ? tf.propStatus[0] : tf.propStatus || '',
			takeResult: tf.takeResult || '',
			takePTS: tf.takePTS || 0,
			takeHide: tf.takeHide || false,
			takeTitle: tf.takeTitle || '',
			takeContentImageUrls: contentImageUrls,
			packIDs, // lookup packIDs for this take
		  };
		});
	} else if (isPG) {
	  // Postgres: derive by phone number with joins for enrichment
	  try {
		const phone = pf.profileMobile;
		if (phone && typeof phone === 'string') {
		  const { rows } = await query(
			`SELECT 
			   t.id AS take_id,
			   t.prop_id_text,
			   t.prop_side,
			   t.take_mobile,
			   t.take_status,
			   t.created_at,
			   t.take_result,
			   t.take_pts,
			   t.tokens AS take_tokens,
			   t.pack_id AS take_pack_uuid,
			   p.prop_summary,
			   p.prop_status,
			   e.title AS event_title,
			   e.league AS event_league,
			   e.espn_game_id,
			   pk.pack_id AS pack_id_text,
			   pk.id AS pack_uuid
			 FROM takes t
			 LEFT JOIN props p ON t.prop_id = p.id
			 LEFT JOIN events e ON p.event_id = e.id
			 LEFT JOIN packs pk ON t.pack_id = pk.id
			 WHERE t.take_mobile = $1 AND t.take_status != 'overwritten'
			 ORDER BY t.created_at DESC LIMIT 5000`,
			[phone]
		  );
		  totalPoints = rows.reduce((sum, r) => sum + (Number(r.take_pts) || 0), 0);
		  for (const r of rows) {
			const packIdForDisplay = r.pack_id_text || r.pack_uuid || null;
			if (r.pack_uuid) userPackIDs.push(r.pack_uuid);
			userTakes.push({
			  takeID: r.take_id,
			  propID: r.prop_id_text || '',
			  propSide: r.prop_side || null,
			  propTitle: r.prop_summary || '',
			  subjectTitle: '',
			  takePopularity: 0,
			  createdTime: r.created_at ? new Date(r.created_at).toISOString() : null,
			  takeStatus: r.take_status || '',
			  propResult: r.take_result || '',
			  propEventMatchup: r.event_title || '',
			  propLeague: r.event_league ? String(r.event_league).toLowerCase() : '',
			  propESPN: r.espn_game_id || '',
			  propStatus: r.prop_status || '',
			  takeResult: r.take_result || '',
			  takePTS: Number(r.take_pts) || 0,
			  takeTokens: (Number(r.take_tokens) || (Number(r.take_pts) || 0) * 0.2),
			  takeHide: false,
			  takeTitle: r.prop_summary || '',
			  takeContentImageUrls: [],
			  packIDs: packIdForDisplay ? [packIdForDisplay] : [],
			});
		  }
		}
	  } catch (fallbackErr) {
		console.error('[profile][pg] take fetch failed =>', fallbackErr);
	  }
	} else {
	  // Airtable fallback by phone
	  try {
		const phone = pf.profileMobile;
		if (phone && typeof phone === 'string') {
		  const filterByFormula = `AND({takeMobile} = "${phone}", {takeStatus} != "overwritten")`;
		  const takeRecords = await base('Takes')
			.select({ filterByFormula, maxRecords: 5000 })
			.all();
		  totalPoints = sumTakePoints(takeRecords);
		  userTakes = takeRecords
			.filter(isVisibleTake)
			.map((t) => {
			  const tf = t.fields;
			  const packIDs = tf.packID || [];
			  userPackIDs.push(...packIDs);
			  let contentImageUrls = [];
			  if (Array.isArray(tf.contentImage)) {
				contentImageUrls = tf.contentImage.map((att) => att.url);
			  }
			  return {
				airtableRecordId: t.id,
				takeID: tf.TakeID || t.id,
				propID: tf.propID || '',
				propSide: tf.propSide || null,
				propTitle: tf.propTitle || '',
				subjectTitle: tf.subjectTitle || '',
				takePopularity: tf.takePopularity || 0,
				createdTime: t._rawJson.createdTime,
				takeStatus: tf.takeStatus || '',
				propResult: Array.isArray(tf.propResult) ? tf.propResult[0] : tf.propResult || '',
				propEventMatchup: Array.isArray(tf.propEventMatchup) ? tf.propEventMatchup[0] : tf.propEventMatchup || '',
				propLeague: Array.isArray(tf.propLeague) ? tf.propLeague[0] : tf.propLeague || '',
				propESPN: Array.isArray(tf.propESPN) ? tf.propESPN[0] : tf.propESPN || '',
				propStatus: Array.isArray(tf.propStatus) ? tf.propStatus[0] : tf.propStatus || '',
				takeResult: tf.takeResult || '',
				takePTS: tf.takePTS || 0,
				takeHide: tf.takeHide || false,
				takeTitle: tf.takeTitle || '',
				takeContentImageUrls: contentImageUrls,
				packIDs,
			  };
			});
		}
	  } catch (fallbackErr) {
		console.error('[profile] Fallback take fetch by phone failed =>', fallbackErr);
	  }
	}

	// 3) Deduplicate and fetch pack details
	const uniquePackIDs = [...new Set(userPackIDs)];
	let validPacks = [];
	if (uniquePackIDs.length > 0) {
	  if (isPG) {
		const params = uniquePackIDs.map((_, i) => `$${i + 1}`).join(',');
		try {
		  const { rows } = await query(`SELECT id, pack_id, pack_url, title, cover_url, event_time, pack_status FROM packs WHERE id IN (${params})`, uniquePackIDs);
		  validPacks = rows.map(r => ({
			packID: r.pack_id || r.id,
			packURL: r.pack_url || '',
			packTitle: r.title || '',
			packStatus: r.pack_status || '',
			packCover: r.cover_url ? [{ url: r.cover_url, filename: 'cover' }] : [],
			eventTime: r.event_time || null,
		  }));
		} catch (pgPackErr) {
		  console.error('[profile][pg] pack fetch failed =>', pgPackErr);
		}
	  } else {
		const filterByFormula = `OR(${uniquePackIDs.map((id) => "{packID}=\"" + id + "\"").join(',')})`;
		const packRecords = await base("Packs")
		  .select({ filterByFormula, maxRecords: uniquePackIDs.length })
		  .all();
		validPacks = packRecords.map((pr) => {
		  const pfld = pr.fields;
		  return {
			packID: pfld.packID || '',
			packURL: pfld.packURL || '',
			packTitle: pfld.packTitle || '',
			packStatus: pfld.packStatus || '',
			packCover: pfld.packCover || [],
			eventTime: pfld.eventTime || null,
		  };
		});
	  }
	}

	// 4) Build the profile data object
	const isCreator = Boolean(pf.creator || pf.Creator || pf.profileCreator || pf.isCreator);
	const profileData = {
	  airtableRecordId: profRec.id,
	  profileID: pf.profileID,
	  profileMobile: pf.profileMobile,
	  profileUsername: pf.profileUsername || '',
	  profileAvatar: pf.profileAvatar || [],
	  profileTeamData, // Contains favorite team info (from PG when available)
	  isCreator,
	  createdTime: profRec._rawJson.createdTime,
	};

	// 5) Compute tokensEarned from Takes instead of achievements
	let achievementsValueTotal = 0;
	let achievements = [];
	let tokensEarned = 0;
	if (isPG) {
	  try {
		const { rows } = await query(
		  `SELECT COALESCE(SUM(t.tokens),0) AS earned
		     FROM takes t
		     JOIN profiles p ON p.mobile_e164 = t.take_mobile
		    WHERE p.profile_id = $1 AND t.take_status = 'latest'`,
		  [profileID]
		);
		tokensEarned = Number(rows[0]?.earned) || 0;
	  } catch (err) {
		tokensEarned = 0;
	  }
	} else {
	  try {
		const phone = pf.profileMobile;
		if (phone) {
		  const filterByFormula = `AND({takeMobile} = "${phone}", {takeStatus} = "latest")`;
		  const takes = await base('Takes').select({ filterByFormula, maxRecords: 5000 }).all();
		  const totalPoints = sumTakePoints(takes);
		  tokensEarned = Math.floor(totalPoints * 0.2);
		}
	  } catch (err) {
		tokensEarned = 0;
	  }
	}

	// 6) Exchanges list (Airtable/PG)
	let userExchanges = [];
	if (includeExchanges) {
	  if (isPG) {
		try {
		  const { rows } = await query(
			`SELECT e.id, e.exchange_tokens, e.created_at, i.item_id AS item_id_text
			   FROM exchanges e
			   JOIN profiles p ON e.profile_id = p.id
			   LEFT JOIN items i ON e.item_id = i.id
			  WHERE p.profile_id = $1
			  ORDER BY e.created_at DESC
			  LIMIT 5000`,
			[profileID]
		  );
		  userExchanges = rows.map(r => ({
			exchangeID: r.id,
			exchangeTokens: Number(r.exchange_tokens) || 0,
			exchangeItem: r.item_id_text ? [r.item_id_text] : [],
			createdTime: r.created_at ? new Date(r.created_at).toISOString() : null,
		  }));
		} catch (pgExErr) {
		  console.error('[profile][pg] Error fetching exchanges =>', pgExErr);
		}
	  } else {
		const exchangeFilter = `{profileID}="${profileID}"`;
		console.log('[profile] Filtering Exchanges with formula:', exchangeFilter);
		const exchRecs = await base('Exchanges')
		  .select({ filterByFormula: exchangeFilter, maxRecords: 5000 })
		  .all();
		console.log(`[profile] Retrieved ${exchRecs.length} Exchanges rows for profileID ${profileID}`);
		userExchanges = exchRecs.map((r) => ({
		  exchangeID: r.id,
		  exchangeTokens: r.fields.exchangeTokens || 0,
		  exchangeItem: r.fields.exchangeItem || [],
		  createdTime: r._rawJson.createdTime,
		}));
	  }
	}

	// 7) Tokens summary consistent with Marketplace
	let tokensSpent = 0;
	if (isPG) {
	  try {
		const { rows } = await query(
		  `SELECT COALESCE(SUM(e.exchange_tokens),0) AS spent
		     FROM exchanges e
		     JOIN profiles p ON e.profile_id = p.id
		    WHERE p.profile_id = $1`,
		  [profileID]
		);
		tokensSpent = Number(rows[0]?.spent) || 0;
	  } catch (pgSpentErr) {
		console.error('[profile][pg] Error computing tokensSpent =>', pgSpentErr);
		tokensSpent = 0;
	  }
	} else {
	  tokensSpent = userExchanges.reduce((sum, ex) => sum + (ex.exchangeTokens || 0), 0);
	}
	const tokensBalance = tokensEarned - tokensSpent;

	// Creator packs/leaderboard (Airtable-only)
	let creatorPacks = [];
	let creatorLeaderboard = [];
	let creatorLeaderboardUpdatedAt = null;
	if (!isPG) {
	  try {
		const hasCreatorFormula = `OR(LEN({packCreator})>0, LEN({PackCreator})>0)`;
		const candidateRecs = await base('Packs')
		  .select({ filterByFormula: hasCreatorFormula, maxRecords: 5000 })
		  .all();
		const profileRecordId = profRec.id;
		creatorPacks = candidateRecs
		  .filter((rec) => {
			const f = rec.fields || {};
			const linksA = Array.isArray(f.packCreator) ? f.packCreator : [];
			const linksB = Array.isArray(f.PackCreator) ? f.PackCreator : [];
			return linksA.includes(profileRecordId) || linksB.includes(profileRecordId);
		  })
		  .map((rec) => {
			const f = rec.fields || {};
			const coverUrl = Array.isArray(f.packCover) && f.packCover.length > 0 ? f.packCover[0].url : null;
			return {
			  airtableId: rec.id,
			  packID: f.packID || rec.id,
			  packURL: f.packURL || '',
			  packTitle: f.packTitle || '',
			  packStatus: f.packStatus || '',
			  packCover: coverUrl,
			  eventTime: f.eventTime || rec._rawJson?.createdTime || null,
			};
		  });
		if (creatorPacks.length > 0) {
		  const cacheKey = profileID;
		  const cached = creatorLeaderboardCache.get(cacheKey);
		  const nowMs = Date.now();
		  if (!refreshBypass && cached && (nowMs - cached.updatedAtMs) < CREATOR_LEADERBOARD_TTL_MS) {
			creatorLeaderboard = cached.leaderboard;
			creatorLeaderboardUpdatedAt = new Date(cached.updatedAtMs).toISOString();
		  } else {
			const packRecordIds = creatorPacks.map(p => p.airtableId);
			if (packRecordIds.length > 0) {
			  const packFilter = `OR(${packRecordIds.map(id => `RECORD_ID()='${id}'`).join(',')})`;
			  const packsFull = await base('Packs').select({ filterByFormula: packFilter, maxRecords: packRecordIds.length }).all();
			  const propRecordIds = [];
			  packsFull.forEach((pr) => {
				const f = pr.fields || {};
				const props = Array.isArray(f.Props) ? f.Props : [];
				propRecordIds.push(...props);
			  });
			  const uniquePropRecordIds = [...new Set(propRecordIds)].filter(Boolean);
			  if (uniquePropRecordIds.length > 0) {
				const propsFilter = `OR(${uniquePropRecordIds.map(id => `RECORD_ID()='${id}'`).join(',')})`;
				const propsFull = await base('Props')
				  .select({ filterByFormula: propsFilter, maxRecords: uniquePropRecordIds.length })
				  .all();
				const allowedPropIds = propsFull
				  .map((r) => r.fields?.propID)
				  .filter((v) => typeof v === 'string' && v.trim());
				if (allowedPropIds.length > 0) {
				  const takesFilter = `AND({takeStatus}='latest', OR(${allowedPropIds.map(pid => `{propID}='${pid}'`).join(',')}))`;
				  const takeRecs = await base('Takes')
					.select({ filterByFormula: takesFilter, maxRecords: 5000 })
					.all();
				  creatorLeaderboard = aggregateTakeStats(takeRecs);
				  creatorLeaderboardUpdatedAt = new Date().toISOString();
				  creatorLeaderboardCache.set(cacheKey, { leaderboard: creatorLeaderboard, updatedAtMs: nowMs });
				}
			  }
			}
		  }
		}
	  } catch (clErr) {
		console.error('[profile] Error building creatorLeaderboard =>', clErr);
	  }
	}

	// 8) Return the aggregated data
	return res.status(200).json({
	  success: true,
	  profile: profileData,
	  totalPoints,
	  totalTakes: userTakes.length,
	  userTakes: userTakes,
	  userPacks: validPacks,
	  userExchanges,
	  achievementsValueTotal,
	  achievements,
	  tokensEarned,
	  tokensSpent,
	  tokensBalance,
	  creatorPacks,
	  creatorLeaderboard,
	  creatorLeaderboardUpdatedAt,
	});
  } catch (err) {
	console.error('[GET /api/profile/:profileID] Error:', err);
	return res.status(500).json({ success: false, error: 'Server error fetching profile' });
  }
}
