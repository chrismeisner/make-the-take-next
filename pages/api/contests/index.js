// File: /pages/api/contests/index.js

import Airtable from "airtable";

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY })
  .base(process.env.AIRTABLE_BASE_ID);

export default async function handler(req, res) {
  if (req.method !== "GET") {
	return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  try {
	// Fetch all records from the "Contests" table
	const records = await base("Contests")
	  .select({
		maxRecords: 100,
		// Optionally filter or sort, e.g.:
		// filterByFormula: '{contestStatus} = "Active"',
		// sort: [{ field: "createdAt", direction: "desc" }]
	  })
	  .all();

	// Map them to a simple array
	const contests = records.map((rec) => {
	  const f = rec.fields;
	  return {
		airtableId: rec.id,
		contestID: f.contestID || "",
		contestTitle: f.contestTitle || "Untitled Contest",
	  };
	});

	return res.status(200).json({ success: true, contests });
  } catch (err) {
	console.error("[api/contests/index] Error =>", err);
	return res.status(500).json({
	  success: false,
	  error: "Failed to fetch contests.",
	});
  }
}
