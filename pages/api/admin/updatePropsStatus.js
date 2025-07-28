import { getToken } from "next-auth/jwt";
import Airtable from "airtable";
import { sendSMS } from "../../../lib/twilioService";

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
  let smsRecipients = [];
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
          // --- SMS notification: fetch takers and send SMS ---
          const packRecord = packRecords[0];
          const packId = packRecord.id;
          // Use the reciprocal Takes link on the Pack record
          const linkedTakeIds = packRecord.fields.Takes || [];
          console.log(`[admin/updatePropsStatus] Pack ${packId} has ${linkedTakeIds.length} linked Takes:`, linkedTakeIds);
          let takes = [];
          if (linkedTakeIds.length > 0) {
            // Build formula to select only the 'latest' takes among these IDs
            const idFilters = linkedTakeIds.map(id => `RECORD_ID()="${id}"`).join(",");
            const formula = `AND({takeStatus} = "latest", OR(${idFilters}))`;
            console.log(`[admin/updatePropsStatus] Fetching Takes with formula: ${formula}`);
            takes = await base("Takes").select({ filterByFormula: formula, maxRecords: linkedTakeIds.length }).all();
          }
          const phones = [...new Set(
            takes.map(t => t.fields.takeMobile).filter(Boolean)
          )];
          smsRecipients = phones;
          console.log(`[admin/updatePropsStatus] Found ${phones.length} SMS recipients:`, phones);
          for (const to of phones) {
            console.log(`[admin/updatePropsStatus] Sending SMS to ${to}`);
            try {
              await sendSMS({
                to,
                message: `🎉 Your pack "${packURL}" has been graded! View results: ${process.env.SITE_URL}/packs/${packURL}`,
              });
              console.log(`[admin/updatePropsStatus] SMS sent to ${to}`);
            } catch (smsErr) {
              console.error("[admin/updatePropsStatus] SMS send error for", to, smsErr);
            }
          }
        }
      } catch (err) {
        console.error("[admin/updatePropsStatus] Error updating packStatus:", err);
      }
    }

    return res.status(200).json({ success: true, smsCount: smsRecipients.length });
  } catch (error) {
    console.error("[admin/updatePropsStatus] Error:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
} 