// File: pages/api/outbox/index.js
import Airtable from "airtable";

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY })
  .base(process.env.AIRTABLE_BASE_ID);

export default async function handler(req, res) {
  if (req.method === "GET") {
	try {
	  const records = await base("Outbox").select({ maxRecords: 100 }).all();
	  return res.status(200).json({
		success: true,
		outbox: records.map((rec) => ({ id: rec.id, ...rec.fields })),
	  });
	} catch (error) {
	  console.error("[Outbox API] Error fetching records:", error);
	  return res.status(500).json({ success: false, error: error.message });
	}
  } else if (req.method === "POST") {
	const { outboxMessage, outboxRecipients, outboxStatus } = req.body;
	try {
	  const created = await base("Outbox").create([
		{
		  fields: {
			outboxMessage,
			outboxRecipients, // expecting an array of linked Profile IDs
			outboxStatus: outboxStatus || "draft",
		  },
		},
	  ]);
	  return res.status(200).json({ success: true, record: created[0] });
	} catch (error) {
	  console.error("[Outbox API] Error creating record:", error);
	  return res.status(500).json({ success: false, error: error.message });
	}
  } else {
	return res.status(405).json({ success: false, error: "Method not allowed" });
  }
}
