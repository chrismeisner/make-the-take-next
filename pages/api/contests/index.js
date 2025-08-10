// File: /pages/api/contests/index.js

import Airtable from "airtable";

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY })
  .base(process.env.AIRTABLE_BASE_ID);

export default async function handler(req, res) {
  if (req.method === "POST") {
    // Create a new contest
    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const {
        contestTitle,
        contestSummary,
        contestPrize,
        contestStatus = "draft",
        contestStartTime,
        contestEndTime,
        packURLs = [],
        contestCoverUrl,
      } = body || {};

      if (!contestTitle) {
        return res.status(400).json({ success: false, error: "contestTitle is required" });
      }

      // Find pack record IDs by packURL if provided
      let packRecordIds = [];
      if (Array.isArray(packURLs) && packURLs.length > 0) {
        const formula = `OR(${packURLs.map((u) => `{packURL} = "${u}"`).join(',')})`;
        const packRecs = await base("Packs").select({ filterByFormula: formula, maxRecords: 100 }).all();
        packRecordIds = packRecs.map((r) => r.id);
      }

      const [created] = await base("Contests").create([
        {
          fields: {
            contestTitle,
            contestSummary,
            contestPrize,
            contestStatus,
            contestStartTime,
            contestEndTime,
            Packs: packRecordIds,
            ...(contestCoverUrl
              ? { contestCover: [{ url: contestCoverUrl }] }
              : {}),
          },
        },
      ]);

      return res.status(200).json({ success: true, contest: { airtableId: created.id } });
    } catch (err) {
      console.error("[api/contests] POST error =>", err);
      return res.status(500).json({ success: false, error: "Failed to create contest" });
    }
  }

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

  // parse attachments with fallbacks and data-shape guards
  const isHttpUrl = (u) => typeof u === 'string' && /^https?:\/\//.test(u);
  let contestCover = [];
  if (Array.isArray(f.contestCover)) {
    contestCover = f.contestCover
      .map((entry) => {
        if (typeof entry === "string") {
          // Some bases may store linked record IDs (e.g., "rec...") — ignore those
          return isHttpUrl(entry) ? { url: entry, filename: "contest-cover" } : null;
        }
        const url = entry?.url || entry?.thumbnails?.large?.url || entry?.thumbnails?.full?.url;
        if (!isHttpUrl(url)) return null;
        return {
          url,
          filename: entry?.filename || "contest-cover",
        };
      })
      .filter(Boolean);
  } else if (typeof f.contestCover === 'string' && isHttpUrl(f.contestCover)) {
    // Handle legacy/text field case where contestCover is a single URL string
    contestCover = [{ url: f.contestCover, filename: 'contest-cover' }];
  }
  // Legacy fallback if only a string URL field exists
  if ((!contestCover || contestCover.length === 0) && isHttpUrl(f.contestCoverUrl)) {
    contestCover = [{ url: f.contestCoverUrl, filename: "contest-cover" }];
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
		// Minimal model: contests are groups of packs => expose packCount
		packCount: Array.isArray(f.Packs) ? f.Packs.length : 0,
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
