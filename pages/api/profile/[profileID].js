import Airtable from 'airtable';
import { sumTakePoints, isVisibleTake } from '../../../lib/points';
import { aggregateTakeStats } from '../../../lib/leaderboard';

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
	// 1) Fetch the profile record from the Profiles table
	const found = await base('Profiles')
	  .select({ filterByFormula: `{profileID}="${profileID}"`, maxRecords: 1 })
	  .all();

	if (found.length === 0) {
	  return res.status(404).json({ success: false, error: 'Profile not found' });
	}

	const profRec = found[0];
	const pf = profRec.fields;

	// Initialize arrays to hold user's takes & packs
	let userTakes = [];
	let userPackIDs = [];
	let totalPoints = 0;

	// 2) If the profile has "Takes" linked, fetch them
	if (Array.isArray(pf.Takes) && pf.Takes.length > 0) {
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
	}

	// 3) Deduplicate and fetch pack details for each unique pack ID in userPacks.
	const uniquePackIDs = [...new Set(userPackIDs)];
	// Fetch all packs by packID lookup field in one go
	const filterByFormula = `OR(${uniquePackIDs.map((id) => "{packID}=\"" + id + "\"").join(',')})`;
	const packRecords = await base("Packs")
	  .select({ filterByFormula, maxRecords: uniquePackIDs.length })
	  .all();
	const validPacks = packRecords.map((pr) => {
	  const pf = pr.fields;
	  return {
		packID: pf.packID || '',
		packURL: pf.packURL || '',
		packTitle: pf.packTitle || '',
		packStatus: pf.packStatus || '',
		packCover: pf.packCover || [],
		eventTime: pf.eventTime || null,
	  };
	});

	// 4) Fetch the Teams record if profileTeam is linked.
	let profileTeamData = null;
	if (Array.isArray(pf.profileTeam) && pf.profileTeam.length > 0) {
	  const teamRecordId = pf.profileTeam[0];
	  if (teamRecordId) {
		try {
		  const teamRec = await base('Teams').find(teamRecordId);
		  const tf = teamRec.fields;
		  let teamLogo = [];
		  if (Array.isArray(tf.teamLogo)) {
			teamLogo = tf.teamLogo.map((img) => ({
			  url: img.url,
			  filename: img.filename,
			}));
		  }
		  profileTeamData = {
			airtableId: teamRec.id,
			teamID: tf.teamID || '',
			teamName: tf.teamName || '',
			teamLogo,
		  };
		} catch (err) {
		  console.error('[profile] Error fetching team record =>', err);
		}
	  }
	}

	// 5) Build the profile data object
	const isCreator = Boolean(pf.creator || pf.Creator || pf.profileCreator || pf.isCreator);
	const profileData = {
	  airtableRecordId: profRec.id,
	  profileID: pf.profileID,
	  profileMobile: pf.profileMobile,
	  profileUsername: pf.profileUsername || '',
	  profileAvatar: pf.profileAvatar || [],
	  profileTeamData, // Contains favorite team info
	  isCreator,
	  createdTime: profRec._rawJson.createdTime,
	};
    // 6) Compute Awards: number of graded packs this profile has won
    let awardsCount = 0;
    try {
      const winnerFormula = `OR(AND(LOWER({packStatus})='graded', {winnerProfileID}='${profileID}'), AND(LOWER({packStatus})='graded', FIND('${profRec.id}', ARRAYJOIN({packWinner}))>0))`;
      const wonRecs = await base('Packs')
        .select({ filterByFormula: winnerFormula, maxRecords: 5000 })
        .all();
      awardsCount = wonRecs.length;
    } catch (awErr) {
      console.error('[profile] Error computing awards =>', awErr);
    }

    // 7) Compute Achievements total value (sum of achievementValue)
    let achievementsValueTotal = 0;
    let achievements = [];
    try {
      // Prefer matching by profileID text field if present on Achievements; fallback to link field
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
    // Fetch packs created by this profile (influencer) via packCreator link
    let creatorPacks = [];
    try {
      // Pull packs that have any creator link, then filter by record ID membership in Node
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
    } catch (cpErr) {
      console.error('[profile] Error fetching creatorPacks =>', cpErr);
    }
    // 7.2) Build all-time leaderboard across props/takes from creator's packs (with cache)
    let creatorLeaderboard = [];
    let creatorLeaderboardUpdatedAt = null;
    try {
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
            // Fetch Props to resolve their textual propID values
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
    // Fetch Exchange records only when requested
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

    // 7.5) Compute tokens summary consistent with Marketplace
    const tokensSpent = userExchanges.reduce((sum, ex) => sum + (ex.exchangeTokens || 0), 0);
    const tokensEarned = achievementsValueTotal; // Achievements-based diamonds (includes signup bonus)
    const tokensBalance = tokensEarned - tokensSpent;

    // 8) Return the aggregated data
	return res.status(200).json({
	  success: true,
	  profile: profileData,
	  totalPoints,
	  totalTakes: userTakes.length,
	  userTakes: userTakes,
	  userPacks: validPacks,
	  userExchanges,
      awardsCount,
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
