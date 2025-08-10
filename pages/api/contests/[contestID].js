// File: /pages/api/contests/[contestID].js

import Airtable from "airtable";

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY })
  .base(process.env.AIRTABLE_BASE_ID);

export default async function handler(req, res) {
  const { contestID } = req.query;

  if (!contestID) {
	return res.status(400).json({
	  success: false,
	  error: "Missing contestID in the query",
	});
  }

  try {
	// 1) Query the "Contests" table for the record with matching {contestID}
	const contestRecords = await base("Contests")
	  .select({
		filterByFormula: `{contestID} = "${contestID}"`,
		maxRecords: 1,
	  })
	  .firstPage();

	if (!contestRecords || contestRecords.length === 0) {
	  return res.status(404).json({
		success: false,
		error: `Contest not found for contestID="${contestID}"`,
	  });
	}

	// Extract the single contest record
	const contestRec = contestRecords[0];
	const f = contestRec.fields;

  // Parse attachments for contestCover with fallbacks and data-shape guards
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

  	// Basic info
  	const contestData = {
  	  airtableId: contestRec.id,
  	  contestID: f.contestID || contestID,
  	  contestTitle: f.contestTitle || "Untitled Contest",
      contestSummary: f.contestSummary || "",
      contestPrize: f.contestPrize || "",
  	  contestDetails: f.contestDetails || "",
  	  contestEndTime: f.contestEndTime || null,
  	  contestCover,
  	};

  // Minimal model: contests are groups of packs
  // Linked field: "Packs" => array of record IDs
  const linkedPackIDs = f.Packs || [];

	// 2) Fetch pack details if any
	let packsData = [];
	if (linkedPackIDs.length > 0) {
	  const formula = `OR(${linkedPackIDs
		.map((id) => `RECORD_ID()="${id}"`)
		.join(",")})`;

	  const packRecords = await base("Packs")
		.select({
		  filterByFormula: formula,
		  maxRecords: 100,
		})
		.all();

	  packsData = packRecords.map((packRec) => {
		const pf = packRec.fields;

		// Parse packCover (array of attachments)
		let packCover = [];
		if (Array.isArray(pf.packCover)) {
		  packCover = pf.packCover.map((file) => ({
			url: file.url,
			filename: file.filename,
		  }));
		}

		return {
		  airtableId: packRec.id,
		  packID: pf.packID || packRec.id,
		  packTitle: pf.packTitle || "Untitled Pack",
		  packURL: pf.packURL || "",
		  packCover,
		  // Added for PackPreview consistency
		  packStatus: pf.packStatus || "Unknown",
		  eventTime: pf.eventTime || null,
		  propEventRollup: Array.isArray(pf.propEventRollup) ? pf.propEventRollup : [],
		  propsCount: Array.isArray(pf.Props) ? pf.Props.length : 0,
		};
	  });
	}

	contestData.packs = packsData;

  // Keep the model minimal: don't expose Props/Takes directly from Contest
  // They are derivable from Packs and not part of the minimal contest contract

	return res.status(200).json({
	  success: true,
	  contest: contestData,
	});
  } catch (err) {
	console.error("[contests/[contestID]] Error =>", err);
	return res.status(500).json({
	  success: false,
	  error: "Internal server error",
	});
  }
}
