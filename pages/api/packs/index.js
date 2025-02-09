// File: /pages/api/packs/index.js
import Airtable from "airtable";

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY })
  .base(process.env.AIRTABLE_BASE_ID);

export default async function handler(req, res) {
  if (req.method !== "GET") {
	return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  try {
	// Fetch all packs (adjust maxRecords as needed)
	const packRecords = await base("Packs")
	  .select({ maxRecords: 100 }) // or remove maxRecords if you like
	  .all();

	const packsData = packRecords.map((record) => {
	  const fields = record.fields;
	  return {
		packID: fields.packID || record.id,
		packTitle: fields.packTitle || "Untitled Pack",
		packURL: fields.packURL || "",
		// any other fields you need
	  };
	});

	return res.status(200).json({ success: true, packs: packsData });
  } catch (error) {
	console.error("[/api/packs/index] Error =>", error);
	return res
	  .status(500)
	  .json({ success: false, error: "Failed to fetch packs." });
  }
}
