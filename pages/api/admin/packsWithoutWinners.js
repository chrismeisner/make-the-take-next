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
    // Find packs where packStatus is graded and packWinner is empty
    const records = await base("Packs")
      .select({
        filterByFormula: "AND(LOWER({packStatus})='graded', {packWinner}=BLANK())",
        maxRecords: 500,
      })
      .all();

    // Optionally include some useful columns
    const packs = records.map((rec) => {
      const f = rec.fields || {};
      return {
        airtableId: rec.id,
        packID: f.packID || rec.id,
        packTitle: f.packTitle || "",
        packURL: f.packURL || "",
        packStatus: f.packStatus || "",
        propsCount: (f.Props || []).length,
        takeCount: Array.isArray(f.Takes) ? f.Takes.length : undefined,
      };
    });

    return res.status(200).json({ success: true, packs });
  } catch (error) {
    console.error("[admin/packsWithoutWinners] Error:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
}


