// File: /pages/api/contests/index.js

import Airtable from "airtable";

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY })
  .base(process.env.AIRTABLE_BASE_ID);

export default async function handler(req, res) {
  if (req.method !== "GET") {
	return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  try {
	// 1) Fetch from "Contests" table
	const records = await base("Contests")
	  .select({
		maxRecords: 100,
		// optional filters or sorts
	  })
	  .all();

	// Collect winner IDs for "graded" expansions if needed
	const allWinnerIDs = new Set();

	// 2) Build rawContests array
	const rawContests = records.map((rec) => {
	  const f = rec.fields;

	  // parse attachments
	  let contestCover = [];
	  if (Array.isArray(f.contestCover)) {
		contestCover = f.contestCover.map((file) => ({
		  url: file.url,
		  filename: file.filename,
		}));
	  }

	  // if there's a single linked record for "contestWinner"
	  let winnerRecordID = null;
	  if (Array.isArray(f.contestWinner) && f.contestWinner.length > 0) {
		winnerRecordID = f.contestWinner[0];
		allWinnerIDs.add(winnerRecordID);
	  }

	  return {
		airtableId: rec.id,
		contestID: f.contestID || "",
		contestTitle: f.contestTitle || "Untitled Contest",
		contestSummary: f.contestSummary || "",
		contestPrize: f.contestPrize || "",
		contestEndTime: f.contestEndTime || null,
		contestStartTime: f.contestStartTime || null, // <== NEW: fetch the start time
		contestStatus: f.contestStatus || "", // "open", "closed", "graded", "coming up"
		contestCover,
		winnerRecordID,
	  };
	});

	// 3) If needed, bulk fetch from "Profiles" for the winners
	let winnerMap = new Map();
	if (allWinnerIDs.size > 0) {
	  const formula = `OR(${[...allWinnerIDs]
		.map((id) => `RECORD_ID() = "${id}"`)
		.join(",")})`;
	  const winnerRecords = await base("Profiles")
		.select({ filterByFormula: formula, maxRecords: 100 })
		.all();

	  winnerRecords.forEach((wr) => {
		const pf = wr.fields;
		winnerMap.set(wr.id, {
		  profileID: pf.profileID || "",
		  profileUsername: pf.profileUsername || "",
		});
	  });
	}

	// 4) Attach the winner object if "graded"
	const contests = rawContests.map((c) => {
	  let contestWinner = null;
	  if (c.winnerRecordID && winnerMap.has(c.winnerRecordID)) {
		contestWinner = winnerMap.get(c.winnerRecordID);
	  }
	  return {
		...c,
		winnerRecordID: undefined,
		contestWinner, // e.g. {profileID, profileUsername} or null
	  };
	});

	return res.status(200).json({ success: true, contests });
  } catch (err) {
	console.error("[api/contests] error =>", err);
	return res.status(500).json({
	  success: false,
	  error: "Failed to fetch contests.",
	});
  }
}
