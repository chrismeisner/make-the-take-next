// File: /pages/api/packs/index.js

import Airtable from "airtable";

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY })
  .base(process.env.AIRTABLE_BASE_ID);

export default async function handler(req, res) {
  if (req.method !== "GET") {
	return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  try {
	// Fetch all active packs
	const packRecords = await base("Packs")
	  .select({
		filterByFormula: `{packStatus} = "Active"`,
		maxRecords: 100,
	  })
	  .all();

	const packsData = packRecords.map((record) => {
	  const fields = record.fields;
	  return {
		packID: fields.packID || record.id,
		packTitle: fields.packTitle || "Untitled Pack",
		packURL: fields.packURL || "",
		packCover: fields.packCover ? fields.packCover[0]?.url : null,
		packPrize: fields.packPrize || "",
		prizeSummary: fields.prizeSummary || "",
		packSummary: fields.packSummary || "",
		packType: fields.packType || "unknown", // Single Select, e.g. "event" or "content"
		eventTime: fields.eventTime || null,    // If relevant for "event" packs
		createdAt: record._rawJson.createdTime, // or fields.Created if you have a custom field
	  };
	});

	res.status(200).json({
	  success: true,
	  packs: packsData,
	});
  } catch (error) {
	console.error("[/api/packs/index] Error =>", error);
	return res
	  .status(500)
	  .json({ success: false, error: "Failed to fetch packs." });
  }
}
