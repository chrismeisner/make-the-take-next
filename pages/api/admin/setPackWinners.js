import { getToken } from "next-auth/jwt";
import Airtable from "airtable";
import { aggregateTakeStats } from "../../../lib/leaderboard";

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

  const { packs } = req.body;
  if (!Array.isArray(packs) || packs.length === 0) {
    return res.status(400).json({ success: false, error: "Missing packs array" });
  }

  let updatedCount = 0;
  const errors = [];

  for (const p of packs) {
    try {
      // Fetch pack by airtableId if provided, else by packURL
      let packRec;
      if (p.airtableId) {
        packRec = await base("Packs").find(p.airtableId);
      } else if (p.packURL) {
        const recs = await base("Packs").select({
          filterByFormula: `{packURL} = "${p.packURL}"`,
          maxRecords: 1,
        }).firstPage();
        packRec = recs[0];
      }
      if (!packRec) {
        errors.push(`Pack not found for ${p.airtableId || p.packURL}`);
        continue;
      }

      const pf = packRec.fields || {};
      // Skip if already has winner or not graded
      if (Array.isArray(pf.packWinner) && pf.packWinner.length > 0) {
        continue;
      }
      const status = String(pf.packStatus || '').toLowerCase();
      if (status !== 'graded') {
        continue;
      }

      // Get latest linked takes to compute winner
      const linkedTakeIds = pf.Takes || [];
      let takes = [];
      if (linkedTakeIds.length > 0) {
        const idFilters = linkedTakeIds.map(id => `RECORD_ID()="${id}"`).join(",");
        const formula = `AND({takeStatus} = "latest", OR(${idFilters}))`;
        takes = await base("Takes").select({ filterByFormula: formula, maxRecords: linkedTakeIds.length }).all();
      }

      const stats = aggregateTakeStats(takes);
      if (stats.length === 0) {
        continue;
      }
      const top = stats[0];
      const winnerPhone = top.phone;
      if (!winnerPhone) {
        continue;
      }
      const profileRecs = await base("Profiles").select({
        filterByFormula: `{profileMobile} = "${winnerPhone}"`,
        maxRecords: 1,
      }).firstPage();
      if (profileRecs.length === 0) {
        errors.push(`No profile found for winner phone ${winnerPhone} (pack ${p.packURL || p.airtableId})`);
        continue;
      }
      const winnerProfileRecordId = profileRecs[0].id;
      await base("Packs").update([
        { id: packRec.id, fields: { packWinner: [winnerProfileRecordId] } },
      ]);
      updatedCount += 1;
    } catch (err) {
      errors.push(`Error on ${p.packURL || p.airtableId}: ${err.message}`);
    }
  }

  return res.status(200).json({ success: true, updatedCount, errors });
}


