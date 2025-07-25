// pages/api/takes/[takeID].js
import Airtable from "airtable";

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY })
  .base(process.env.AIRTABLE_BASE_ID);

export default async function handler(req, res) {
  if (req.method !== "GET") {
	return res
	  .status(405)
	  .json({ success: false, error: "Method not allowed" });
  }

  const { takeID } = req.query;
  
  try {
    // Query the "Takes" table for all records matching the receiptID field
	const filterFormula = `{receiptID} = "${takeID}"`;
	console.log('[API Takes] filterFormula for receiptID fetch:', filterFormula);
	const records = await base("Takes")
	  .select({
		filterByFormula: filterFormula,
		maxRecords: 1000,
	  })
	  .all();
	console.log('[API Takes] Retrieved', records.length, 'records for receiptID:', takeID);
	if (records.length === 0) {
	  console.log('[API Takes] No takes found for receiptID:', takeID);
	  return res.status(404).json({ success: false, error: "Take not found" });
	}

	// Map each record to a simpler take object
	const takes = records.map((r) => ({
	  id: r.id,
	  receiptID: r.fields.receiptID || r.id,
	  propID: r.fields.propID,
	  propSide: r.fields.propSide,
	  // include short labels for each side
	  propSideAShort: r.fields.propSideAShort || "",
	  propSideBShort: r.fields.propSideBShort || "",
	  propTitle: r.fields.propTitle || "",
	  createdTime: r._rawJson.createdTime,
	}));

	// Return all takes for this receipt
	return res.status(200).json({ success: true, takes });
  } catch (error) {
	console.error("[API Takes] Error fetching takes for receiptID:", error);
	return res.status(500).json({ success: false, error: "Server error fetching takes" });
  }
}
