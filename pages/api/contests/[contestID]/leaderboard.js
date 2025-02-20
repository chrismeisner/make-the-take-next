// File: /pages/api/contests/[contestID]/leaderboard.js

import Airtable from "airtable";

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY })
  .base(process.env.AIRTABLE_BASE_ID);

export default async function handler(req, res) {
  const { contestID } = req.query;

  if (!contestID) {
	return res.status(400).json({ success: false, error: "Missing contestID" });
  }

  try {
	// 1) Fetch the single contest record by {contestID}
	const contestRecords = await base("Contests")
	  .select({
		filterByFormula: `{contestID} = "${contestID}"`,
		maxRecords: 1,
	  })
	  .firstPage();

	if (!contestRecords.length) {
	  return res.status(404).json({
		success: false,
		error: `Contest not found for contestID="${contestID}"`,
	  });
	}

	const contestRec = contestRecords[0];
	const f = contestRec.fields;
	// "Packs" is a linked field => array of record IDs
	const linkedPackIDs = f.Packs || [];

	if (!linkedPackIDs.length) {
	  // No packs => no props => no takes
	  return res.status(200).json({ success: true, leaderboard: [] });
	}

	// 2) Gather propIDs from those packs
	//    We'll fetch each pack record, see which Props it has
	//    Then we gather all their propIDs to filter the Takes
	const formulaPacks = `OR(${linkedPackIDs
	  .map((id) => `RECORD_ID()="${id}"`)
	  .join(",")})`;

	const packRecords = await base("Packs")
	  .select({ filterByFormula: formulaPacks, maxRecords: 100 })
	  .all();

	// Build a combined list of propIDs from each pack
	let allPropIDs = [];
	for (const packRec of packRecords) {
	  const pf = packRec.fields;
	  // "Props" is presumably a linked field => array of record IDs
	  // but we need the actual `propID` text field from the "Props" table
	  // so we do an extra step: fetch the "Props" by record ID
	  const linkedPropRecordIDs = pf.Props || [];
	  if (linkedPropRecordIDs.length) {
		// Build formula for these prop record IDs
		const formulaProps = `OR(${linkedPropRecordIDs
		  .map((id) => `RECORD_ID()="${id}"`)
		  .join(",")})`;

		const propRecs = await base("Props")
		  .select({ filterByFormula: formulaProps, maxRecords: 500 })
		  .all();

		const packPropIDs = propRecs.map((pr) => pr.fields.propID).filter(Boolean);
		allPropIDs.push(...packPropIDs);
	  }
	}

	// Remove duplicates
	const uniquePropIDs = [...new Set(allPropIDs)];

	if (!uniquePropIDs.length) {
	  // No props => no takes
	  return res.status(200).json({ success: true, leaderboard: [] });
	}

	// 3) Gather all Takes that match these propIDs (excluding overwritten)
	const allTakes = await base("Takes")
	  .select({
		maxRecords: 5000,
		filterByFormula: `AND({takeStatus} != "overwritten")`,
	  })
	  .all();

	// Filter to only those whose {propID} is in uniquePropIDs
	const relevantTakes = allTakes.filter((takeRec) => {
	  const tPropID = takeRec.fields.propID;
	  return uniquePropIDs.includes(tPropID);
	});

	// 4) Build phone-based stats as in your existing /api/leaderboard
	const phoneStats = new Map();

	for (const take of relevantTakes) {
	  const phone = take.fields.takeMobile || "Unknown";
	  const points = take.fields.takePTS || 0;
	  const result = take.fields.takeResult || "";

	  if (!phoneStats.has(phone)) {
		phoneStats.set(phone, { takes: 0, points: 0, won: 0, lost: 0 });
	  }

	  const currentStats = phoneStats.get(phone);
	  currentStats.takes += 1;
	  currentStats.points += points;

	  if (result === "Won") currentStats.won += 1;
	  if (result === "Lost") currentStats.lost += 1;

	  phoneStats.set(phone, currentStats);
	}

	// 5) Build a phone -> profileID map by fetching all "Profiles" rows
	const allProfiles = await base("Profiles").select({ maxRecords: 5000 }).all();
	const phoneToProfileID = new Map();
	allProfiles.forEach((profile) => {
	  const { profileMobile, profileID } = profile.fields;
	  if (profileMobile && profileID) {
		phoneToProfileID.set(profileMobile, profileID);
	  }
	});

	// 6) Build the final leaderboard array
	const leaderboard = Array.from(phoneStats.entries())
	  .map(([phone, stats]) => ({
		// We'll store phone internally if needed, but the front end only uses profileID
		phone,
		profileID: phoneToProfileID.get(phone) || null,
		count: stats.takes,
		points: stats.points,
		won: stats.won,
		lost: stats.lost,
	  }))
	  .sort((a, b) => b.points - a.points);

	return res.status(200).json({ success: true, leaderboard });
  } catch (err) {
	console.error("[contest leaderboard] Error =>", err);
	return res.status(500).json({ success: false, error: err.message });
  }
}
