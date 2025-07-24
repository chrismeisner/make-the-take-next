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

  const { updates, packURL } = req.body;
  if (!Array.isArray(updates) || updates.length === 0) {
    return res.status(400).json({ success: false, error: "Missing updates array" });
  }

  try {
    // Prepare updates, computing final popularity percentages for graded props
    const formatted = [];
    for (const u of updates) {
      const fields = { propStatus: u.propStatus };
      if (u.propResult !== undefined) {
        fields.propResult = u.propResult;
      }
      // When prop is graded or pushed, compute final side popularity
      if (["gradedA", "gradedB", "push"].includes(u.propStatus)) {
        const takes = await base("Takes").select({
          filterByFormula: `AND({propID}="${u.propID}", {takeStatus} != "overwritten")`
        }).all();
        let countA = 0;
        let countB = 0;
        takes.forEach((t) => {
          if (t.fields.propSide === "A") countA++;
          if (t.fields.propSide === "B") countB++;
        });
        const total = countA + countB;
        fields.sideAPER = total > 0 ? countA / total : 0;
        fields.sideBPER = total > 0 ? countB / total : 0;
      }
      formatted.push({ id: u.airtableId, fields });
    }
    await base("Props").update(formatted);

    // If packURL provided and all props are graded or pushed, update packStatus to "graded"
    if (packURL && updates.every(u => ["gradedA", "gradedB", "push"].includes(u.propStatus))) {
      try {
        const packRecords = await base("Packs").select({
          filterByFormula: `{packURL} = "${packURL}"`,
          maxRecords: 1,
        }).firstPage();
        if (packRecords.length > 0) {
          await base("Packs").update([
            { id: packRecords[0].id, fields: { packStatus: "graded" } },
          ]);
        }
      } catch (err) {
        console.error("[admin/updatePropsStatus] Error updating packStatus:", err);
      }
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("[admin/updatePropsStatus] Error:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
} 