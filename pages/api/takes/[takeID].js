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
    // Fetch the single take record by record ID or TakeID field
    const filterFormula = `OR(RECORD_ID() = "${takeID}", {TakeID} = "${takeID}")`;
    const records = await base("Takes")
      .select({ filterByFormula, maxRecords: 1 })
      .all();
    if (records.length === 0) {
      return res.status(404).json({ success: false, error: "Take not found" });
    }
    const record = records[0];
    const take = {
      takeID: record.fields.TakeID || record.id,
      propID: record.fields.propID,
      propSide: record.fields.propSide,
      createdTime: record._rawJson.createdTime,
    };

    // Fetch prop details for this take
    const propRecords = await base("Props")
      .select({ filterByFormula: `{propID} = "${take.propID}"`, maxRecords: 1 })
      .all();
    let prop = null;
    if (propRecords.length > 0) {
      const f = propRecords[0].fields;
      prop = {
        propID: f.propID || null,
        propShort: f.propShort || f.PropShort || "",
        propSummary: f.propSummary || "",
        propStatus: f.propStatus || "open",
      };
    }

    return res.status(200).json({ success: true, take, prop });
  } catch (error) {
	console.error("[API Takes] Error fetching takes for receiptID:", error);
	return res.status(500).json({ success: false, error: "Server error fetching takes" });
  }
}
