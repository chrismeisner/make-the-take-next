// File: pages/api/leaderboard.js
import Airtable from 'airtable';
import { aggregateTakeStats } from '../../lib/leaderboard';
import { getDataBackend } from '../../lib/runtimeConfig';
import { query } from '../../lib/db/postgres';
const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);

export default async function handler(req, res) {
  const { subjectID, packURL } = req.query;

  try {
    // Postgres path
    if (getDataBackend() === 'postgres') {
      // Enrich phones with profileIDs
      const { rows: profRows } = await query('SELECT mobile_e164, profile_id FROM profiles');
      const phoneToProfileID = new Map(profRows.map(r => [r.mobile_e164, r.profile_id]));

      let propIdFilter = null;
      if (packURL) {
        const { rows: propRows } = await query(
          `SELECT p.prop_id FROM props p
             JOIN packs k ON p.pack_id = k.id
            WHERE k.pack_url = $1`,
          [packURL]
        );
        propIdFilter = new Set(propRows.map(r => r.prop_id));
        if (propRows.length === 0) {
          return res.status(200).json({ success: true, leaderboard: [] });
        }
      }

      const { rows: takeRows } = await query(
        `SELECT take_mobile, prop_id_text, take_result, COALESCE(take_pts, 0) AS take_pts
           FROM takes
          WHERE take_status = 'latest'`
      );

      let filtered = takeRows;
      if (propIdFilter) {
        filtered = filtered.filter(t => propIdFilter.has(t.prop_id_text));
      }
      if (subjectID) {
        const { rows: subjProps } = await query(
          `SELECT prop_id FROM props WHERE prop_summary ILIKE $1`,
          [ `%${subjectID}%` ]
        );
        const subjSet = new Set(subjProps.map(r => r.prop_id));
        filtered = filtered.filter(t => subjSet.has(t.prop_id_text));
      }

      const pseudoTakes = filtered.map((r) => ({ fields: { takeMobile: r.take_mobile, takeResult: r.take_result || null, takePTS: Number(r.take_pts) || 0, takeStatus: 'latest' } }));
      const statsList = aggregateTakeStats(pseudoTakes);
      const leaderboard = statsList.map((s) => ({
        phone: s.phone,
        takes: s.takes,
        points: s.points,
        profileID: phoneToProfileID.get(s.phone) || null,
        won: s.won,
        lost: s.lost,
        pushed: s.pushed,
      }));
      return res.status(200).json({ success: true, leaderboard });
    }

	// 1) Fetch all profiles so we can map phone -> profileID
	const allProfiles = await base('Profiles').select({ maxRecords: 5000 }).all();
	const phoneToProfileID = new Map();
	allProfiles.forEach((profile) => {
	  const { profileMobile, profileID } = profile.fields;
	  if (profileMobile && profileID) {
		phoneToProfileID.set(profileMobile, profileID);
	  }
	});

	// 2) If packURL is given => we gather propIDs from that pack
	let packPropIDs = null;
	if (packURL) {
	  // Find the pack by packURL
	  const packRecords = await base("Packs")
		.select({
		  filterByFormula: `{packURL} = "${packURL}"`,
		  maxRecords: 1,
		})
		.firstPage();

	  if (packRecords.length === 0) {
		return res.status(404).json({
		  success: false,
		  error: `Pack not found for packURL="${packURL}"`,
		});
	  }

	  const packFields = packRecords[0].fields;
	  const linkedPropRecordIDs = packFields.Props || []; // array of record IDs from the "Props" field

	  if (linkedPropRecordIDs.length > 0) {
		// Build formula to fetch those prop records, then extract the actual propID field
		const formula = `OR(${linkedPropRecordIDs
		  .map((id) => `RECORD_ID()='${id}'`)
		  .join(",")})`;

		const propsRecords = await base("Props")
		  .select({
			filterByFormula: formula,
			maxRecords: 500,
		  })
		  .all();

		packPropIDs = propsRecords.map((r) => r.fields.propID).filter(Boolean);
	  } else {
		// If no Props in this pack, the leaderboard is empty
		return res.status(200).json({ success: true, leaderboard: [] });
	  }
	}

	// 3) Fetch Takes (using the “All” view to exclude hidden/overwritten)
	let allTakes = await base('Takes')
	  .select({ maxRecords: 5000 })
	  .all();

	// 4) If we have a packURL => filter out any takes that do NOT match those pack propIDs
	if (packPropIDs) {
	  allTakes = allTakes.filter((take) => {
		const tPropID = take.fields.propID;
		return packPropIDs.includes(tPropID);
	  });
	}

	// 5) If a subjectID is provided, further filter by subject
	//    (If you don't want both packURL & subjectID combined, you could do an 'else if' instead.)
	if (subjectID) {
	  allTakes = allTakes.filter((take) => {
		const propSubj = take.fields.propSubjectID || [];
		return Array.isArray(propSubj)
		  ? propSubj.includes(subjectID)
		  : propSubj === subjectID;
	  });
	}

	// Exclude any takes for archived or draft props
	allTakes = allTakes.filter((take) => {
	  const propStatus = take.fields.propStatus || 'open';
	  return propStatus !== 'archived' && propStatus !== 'draft';
	});

	// Exclude hidden takes based on takeHide field
	allTakes = allTakes.filter((take) => !Boolean(take.fields.takeHide));

	// Aggregate stats using shared helper
	const statsList = aggregateTakeStats(allTakes);
	const leaderboard = statsList.map((s) => ({
	  phone: s.phone,
	  takes: s.takes,
	  points: s.points,
	  profileID: phoneToProfileID.get(s.phone) || null,
	  won: s.won,
	  lost: s.lost,
	  pushed: s.pushed,
	}));

	res.status(200).json({ success: true, leaderboard });
  } catch (err) {
	console.error('[API /leaderboard] Error:', err);
	res.status(500).json({ success: false, error: 'Failed to fetch leaderboard' });
  }
}
