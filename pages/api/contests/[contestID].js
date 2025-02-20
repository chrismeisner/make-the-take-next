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

	// Basic info
	const contestData = {
	  airtableId: contestRec.id,
	  contestID: f.contestID || contestID,
	  contestTitle: f.contestTitle || "Untitled Contest",
	  contestDetails: f.contestDetails || "",
	  // NEW: Retrieve the date/time field from Airtable
	  contestEndTime: f.contestEndTime || null,
	};

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
		};
	  });
	}

	contestData.packs = packsData;

	// If you want "Props" or "Takes" from the Contest record, keep them:
	contestData.linkedPropIDs = f.Props || [];
	contestData.linkedTakeIDs = f.Takes || [];

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
