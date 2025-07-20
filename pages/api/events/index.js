import Airtable from "airtable";

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY })
  .base(process.env.AIRTABLE_BASE_ID);

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }
  try {
    const records = await base("Events").select({ maxRecords: 100 }).all();
    const events = records.map((rec) => {
      const f = rec.fields;
      return {
        id: rec.id,
        eventTime: f.eventTime || null,
        eventTitle: f.eventTitle || "",
      };
    });
    return res.status(200).json({ success: true, events });
  } catch (error) {
    console.error("[api/events] Error =>", error);
    return res.status(500).json({ success: false, error: "Failed to fetch events" });
  }
} 