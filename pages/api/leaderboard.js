// File: pages/api/leaderboard.js
import Airtable from 'airtable';
import { aggregateTakeStats } from '../../lib/leaderboard';

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);

export default async function handler(req, res) {
  const { subjectID, packURL } = req.query;

  try {
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

	// 3) Fetch Takes (excluding overwritten)
	let allTakes = await base('Takes')
	  .select({
		maxRecords: 5000,
		filterByFormula: '{takeStatus} != "overwritten"',
	  })
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
