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

  const { propIDs } = req.body || {};
  if (!Array.isArray(propIDs) || propIDs.length === 0) {
    return res.status(400).json({ success: false, error: "propIDs must be a non-empty array" });
  }

  try {
    const uniquePropIDs = [...new Set(propIDs.filter(Boolean))];
    const chunks = [];
    const chunkSize = 50; // Airtable OR() practical limit safeguard
    for (let i = 0; i < uniquePropIDs.length; i += chunkSize) {
      chunks.push(uniquePropIDs.slice(i, i + chunkSize));
    }

    let allRecords = [];
    for (const chunk of chunks) {
      const formula = `OR(${chunk.map((pid) => `{propID} = "${pid}"`).join(',')})`;
      const records = await base("Props")
        .select({
          filterByFormula: formula,
          maxRecords: chunk.length,
        })
        .all();
      allRecords = allRecords.concat(records);
    }

    const props = allRecords.map((rec) => {
      const f = rec.fields;
      const sideCount = f.sideCount || 2;
      const sideLabels = Array.from({ length: sideCount }, (_, i) => {
        const letter = String.fromCharCode(65 + i);
        return f[`PropSide${letter}Short`] || f[`propSide${letter}Short`] || "";
      });
      return {
        airtableId: rec.id,
        propID: f.propID || rec.id,
        propShort: f.propShort || f.PropShort || "",
        propSummary: f.propSummary || "",
        propStatus: f.propStatus || "open",
        propResult: f.propResult || "",
        sideCount,
        sideLabels,
        propESPNLookup: f.propESPNLookup || null,
        propLeagueLookup: f.propLeagueLookup || null,
        propEventTimeLookup: f.propEventTimeLookup || null,
        propEventMatchup: Array.isArray(f.propEventMatchup) ? f.propEventMatchup[0] : (f.propEventMatchup || null),
      };
    });

    return res.status(200).json({ success: true, props });
  } catch (error) {
    console.error("[admin/getPropsByIDs] Error:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
