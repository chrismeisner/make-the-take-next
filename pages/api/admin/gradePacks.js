import { getToken } from "next-auth/jwt";
import Airtable from "airtable";

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY })
  .base(process.env.AIRTABLE_BASE_ID);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) {
    return res.status(401).json({ success: false, error: "Unauthorized" });
  }

  try {
    // Fetch all active packs
    const records = await base("Packs")
      .select({ filterByFormula: `{packStatus}="Active"` })
      .all();
    const now = new Date();
    // Filter packs with eventTime in the past
    const expiredPacks = records.filter((rec) => {
      const ev = rec.fields.eventTime;
      if (!ev) return false;
      const evDate = new Date(ev);
      return evDate < now;
    });
    const packs = expiredPacks.map((rec) => {
      const fields = rec.fields;
      return {
        airtableId: rec.id,
        packID: fields.packID || rec.id,
        packTitle: fields.packTitle || "",
        packURL: fields.packURL || "",
        eventTime: fields.eventTime || null,
        packStatus: fields.packStatus || "",
      };
    });
    return res.status(200).json({ success: true, packs });
  } catch (error) {
    console.error("[admin/gradePacks] Error:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
} 