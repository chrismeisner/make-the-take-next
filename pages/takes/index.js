// pages/api/takes/index.js
import Airtable from "airtable";

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY })
  .base(process.env.AIRTABLE_BASE_ID);

export default async function handler(req, res) {
  if (req.method !== "GET") {
	return res
	  .status(405)
	  .json({ success: false, error: "Method not allowed" });
  }

  try {
	// Query the "Takes" table for records where takeStatus is not "overwritten"
	const records = await base("Takes")
	  .select({
		filterByFormula: `{takeStatus} != "overwritten"`,
		sort: [{ field: "Created", direction: "desc" }],
		maxRecords: 5000,
	  })
	  .all();

	// Map each record to include its fields, record id, and created time
	const takes = records.map((record) => ({
	  ...record.fields,
	  airtableId: record.id,
	  createdTime: record._rawJson.createdTime,
	}));

	return res.status(200).json({ success: true, takes });
  } catch (error) {
	console.error("[API Takes] Error:", error);
	return res
	  .status(500)
	  .json({ success: false, error: "Server error fetching takes" });
  }
}
