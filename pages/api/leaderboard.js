// File: /pages/api/leaderboard.js
import Airtable from 'airtable';

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

	// phoneStats will store data like:
	// {
	//   takes: <number>,
	//   points: <number>,
	//   won: <number>,
	//   lost: <number>
	// }
	const phoneStats = new Map();

	allTakes.forEach((take) => {
	  const phone = take.fields.takeMobile || 'Unknown';
	  const points = take.fields.takePTS || 0;
	  const result = take.fields.takeResult || ''; // "Won", "Lost", etc.

	  if (!phoneStats.has(phone)) {
		phoneStats.set(phone, { takes: 0, points: 0, won: 0, lost: 0, pushed: 0 });
	  }

	  const currentStats = phoneStats.get(phone);

	  currentStats.takes += 1;      // increment total # of takes
	  currentStats.points += points; // add any points

	  // if takeResult is "Won" => increment won
	  // if "Lost" => increment lost
	  if (result === 'Won') {
		currentStats.won += 1;
	  } else if (result === 'Lost') {
		currentStats.lost += 1;
	  } else if (result === 'Pushed' || result === 'Push') {
		currentStats.pushed += 1;
	  }

	  phoneStats.set(phone, currentStats);
	});

	// Build the final array
	const leaderboard = Array.from(phoneStats.entries())
	  .map(([phone, stats]) => ({
		phone,
		count: stats.takes,
		points: stats.points,
		profileID: phoneToProfileID.get(phone) || null,
		won: stats.won,
		lost: stats.lost,
		pushed: stats.pushed,
	  }))
	  // Sort by points descending (or however you want)
	  .sort((a, b) => b.points - a.points);

	res.status(200).json({ success: true, leaderboard });
  } catch (err) {
	console.error('[API /leaderboard] Error:', err);
	res.status(500).json({ success: false, error: 'Failed to fetch leaderboard' });
  }
}
