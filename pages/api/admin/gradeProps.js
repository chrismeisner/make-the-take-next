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
    // Fetch props with status open or closed
    const records = await base("Props")
      .select({
        filterByFormula: `OR(LOWER({propStatus})="open", LOWER({propStatus})="closed")`
      })
      .all();
    const now = new Date();

    // Filter props whose event time is in the past
    const readyProps = records.filter((rec) => {
      const ev = rec.fields.propEventTimeLookup;
      if (!ev) return false;
      const evDate = new Date(ev);
      return evDate < now;
    });

    const props = readyProps.map((rec) => {
      const f = rec.fields;
      return {
        airtableId: rec.id,
        propID: f.propID || rec.id,
        propShort: f.propShort || "",
        propSummary: f.propSummary || "",
        PropSideAShort: f.PropSideAShort || "",
        PropSideBShort: f.PropSideBShort || "",
        propStatus: f.propStatus || "",
        propEventTimeLookup: f.propEventTimeLookup || null,
        propLeagueLookup: f.propLeagueLookup || null,
        propESPNLookup: f.propESPNLookup || null,
        propEventMatchup: Array.isArray(f.propEventMatchup) ? f.propEventMatchup[0] : (f.propEventMatchup || null),
      };
    });
    return res.status(200).json({ success: true, props });
  } catch (error) {
    console.error("[admin/gradeProps] Error:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
