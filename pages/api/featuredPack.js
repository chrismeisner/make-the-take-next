// File: /pages/api/featuredPack.js
import Airtable from "airtable";

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY })
  .base(process.env.AIRTABLE_BASE_ID);

export default async function handler(req, res) {
  if (req.method !== "GET") {
	return res.status(405).json({ success: false, error: "Method not allowed" });
  }
  try {
	// Query the "featuredPacks" table for the active record.
	const records = await base("featuredPacks")
	  .select({
		filterByFormula: `{featuredStatus} = "active"`,
		maxRecords: 1,
	  })
	  .firstPage();

	if (records.length === 0) {
	  return res
		.status(200)
		.json({ success: false, error: "No active featured pack" });
	}
	const record = records[0];
	const f = record.fields;

	// "Pack" field is a linked record field. Fetch the linked Pack record.
	let packData = null;
	if (f.Pack && Array.isArray(f.Pack) && f.Pack.length > 0) {
	  try {
		const packRecord = await base("Packs").find(f.Pack[0]);
		packData = packRecord.fields;
	  } catch (error) {
		console.error("Error fetching linked Pack record:", error);
	  }
	}

	// Build the featured pack data using fields from both tables.
	const featuredPack = {
	  featuredID: f.featuredID || record.id,
	  packTitle: packData?.packTitle || "No Title",
	  packURL: packData?.packURL || "", // needed for linking to pack detail page
	  packCover: packData?.packCover || [], // NEW: packCover attachment field
	  packPrizeImage: packData?.packPrizeImage || [],
	  prizeSummary: packData?.prizeSummary || "",
	};

	return res.status(200).json({ success: true, featuredPack });
  } catch (error) {
	console.error("[featuredPack API] Error:", error);
	return res.status(500).json({ success: false, error: error.message });
  }
}
