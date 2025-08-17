// File: /pages/api/contests/[contestID].js

import Airtable from "airtable";
import { getToken } from "next-auth/jwt";

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

  // Admin: update linked Packs on a contest
  if (req.method === "PATCH") {
    try {
      const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
      if (!token) {
        return res.status(401).json({ success: false, error: "Unauthorized" });
      }

      const { packRecordIds, packURLs } = req.body || {};
      if (!Array.isArray(packRecordIds) && !Array.isArray(packURLs)) {
        return res.status(400).json({ success: false, error: "Must provide packRecordIds or packURLs array" });
      }

      // Find contest record
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

      const contestRec = contestRecords[0];

      // Resolve record IDs if only URLs provided
      let finalPackRecordIds = Array.isArray(packRecordIds) ? packRecordIds : [];
      if (!finalPackRecordIds.length && Array.isArray(packURLs) && packURLs.length) {
        const formula = `OR(${packURLs.map((u) => `{packURL} = "${u}"`).join(",")})`;
        const packRecs = await base("Packs").select({ filterByFormula: formula, maxRecords: 100 }).all();
        finalPackRecordIds = packRecs.map((r) => r.id);
      }

      const updated = await base("Contests").update([
        { id: contestRec.id, fields: { Packs: finalPackRecordIds } },
      ]);

      return res.status(200).json({ success: true, record: updated[0] });
    } catch (err) {
      console.error("[contests/[contestID] PATCH] Error =>", err);
      return res.status(500).json({ success: false, error: "Internal server error" });
    }
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

	  // Attach total take counts for these packs using Takes table (latest only)
	  try {
		const takeRecords = await base("Takes").select({
		  filterByFormula: '{takeStatus}="latest"',
		  maxRecords: 5000,
		}).all();

		const packIdToCount = {};
		takeRecords.forEach((takeRec) => {
		  const packIDValue = takeRec.fields.packID;
		  if (!packIDValue) return;
		  if (Array.isArray(packIDValue)) {
			packIDValue.forEach((pid) => {
			  packIdToCount[pid] = (packIdToCount[pid] || 0) + 1;
			});
		  } else {
			packIdToCount[packIDValue] = (packIdToCount[packIDValue] || 0) + 1;
		  }
		});

		packsData = packsData.map((p) => ({
		  ...p,
		  takeCount: packIdToCount[p.packID] || 0,
		}));
	  } catch (err) {
		console.error('[contests/[contestID]] Error attaching total takes =>', err);
	  }
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
