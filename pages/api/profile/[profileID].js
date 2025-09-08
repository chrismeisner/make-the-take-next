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

  try {
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
		profileUsername: r.username || '',
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
	  // Postgres: derive by phone number
	  try {
		const phone = pf.profileMobile;
		if (phone && typeof phone === 'string') {
		  const { rows } = await query(
			`SELECT id, prop_id_text, prop_side, take_mobile, take_status, created_at, take_result, take_pts, pack_id
			 FROM takes
			 WHERE take_mobile = $1 AND take_status != 'overwritten'
			 ORDER BY created_at DESC LIMIT 5000`,
			[phone]
		  );
		  totalPoints = rows.reduce((sum, r) => sum + (Number(r.take_pts) || 0), 0);
		  for (const r of rows) {
			if (r.pack_id) userPackIDs.push(r.pack_id);
			userTakes.push({
			  takeID: r.id,
			  propID: r.prop_id_text || '',
			  propSide: r.prop_side || null,
			  propTitle: '',
			  subjectTitle: '',
			  takePopularity: 0,
			  createdTime: r.created_at ? new Date(r.created_at).toISOString() : null,
			  takeStatus: r.take_status || '',
			  propResult: r.take_result || '',
			  propEventMatchup: '',
			  propLeague: '',
			  propESPN: '',
			  propStatus: '',
			  takeResult: r.take_result || '',
			  takePTS: Number(r.take_pts) || 0,
			  takeHide: false,
			  takeTitle: '',
			  takeContentImageUrls: [],
			  packIDs: [],
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

	// 5) Achievements (remove for Postgres; keep Airtable path only)
	let achievementsValueTotal = 0;
	let achievements = [];
	if (!isPG) {
	  try {
		let achRecs = await base('Achievements')
		  .select({ filterByFormula: `{profileID}="${profileID}"`, maxRecords: 5000 })
		  .all();
		if (achRecs.length === 0) {
		  const fallbackFormula = `FIND('${profRec.id}', ARRAYJOIN({achievementProfile}))>0`;
		  achRecs = await base('Achievements')
			.select({ filterByFormula: fallbackFormula, maxRecords: 5000 })
			.all();
		}
		achievements = achRecs.map((r) => ({
		  id: r.id,
		  achievementKey: r.fields.achievementKey || '',
		  achievementTitle: r.fields.achievementTitle || '',
		  achievementDescription: r.fields.achievementDescription || '',
		  achievementValue: typeof r.fields.achievementValue === 'number' ? r.fields.achievementValue : 0,
		  createdTime: r._rawJson.createdTime,
		}));
		achievementsValueTotal = achievements.reduce((sum, a) => sum + (a.achievementValue || 0), 0);
	  } catch (achErr) {
		console.error('[profile] Error fetching achievements =>', achErr);
	  }
	}

	// 6) Reuse existing exchanges logic only when requested (Airtable)
	let userExchanges = [];
	if (includeExchanges) {
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

	// 7) Tokens summary consistent with Marketplace
	const tokensSpent = userExchanges.reduce((sum, ex) => sum + (ex.exchangeTokens || 0), 0);
	const tokensEarned = !isPG ? achievementsValueTotal : 0; // disable achievements in PG mode
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
