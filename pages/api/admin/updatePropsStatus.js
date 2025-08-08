import { getToken } from "next-auth/jwt";
import Airtable from "airtable";
import { sendSMS } from "../../../lib/twilioService";
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
    if (packURL) {
      try {
        // Fetch the Pack record to get linked Props
        const packRecs = await base("Packs").select({
          filterByFormula: `{packURL} = "${packURL}"`,
          maxRecords: 1,
        }).firstPage();
        if (packRecs.length > 0) {
          const pr = packRecs[0];
          const propIds = pr.fields.Props || [];
          if (propIds.length > 0) {
            // Fetch all Props for this pack
            const propFormula = `OR(${propIds.map(id => `RECORD_ID()="${id}"`).join(",")})`;
            const propRecs = await base("Props").select({ filterByFormula: propFormula, maxRecords: propIds.length }).all();
            // Check that all Props are graded or pushed
            const allGraded = propRecs.every(r => {
              const status = r.fields.propStatus;
              return ["gradedA", "gradedB", "push"].includes(status);
            });
            if (allGraded) {
              // Update packStatus to graded
              await base("Packs").update([{ id: pr.id, fields: { packStatus: "graded" } }]);
              console.log(`[admin/updatePropsStatus] Pack ${pr.id} status set to graded`);
              // Send SMS notifications as before
              const linkedTakeIds = pr.fields.Takes || [];
              let takes = [];
              if (linkedTakeIds.length > 0) {
                const idFilters = linkedTakeIds.map(id => `RECORD_ID()="${id}"`).join(",");
                const formula = `AND({takeStatus} = "latest", OR(${idFilters}))`;
                takes = await base("Takes").select({ filterByFormula: formula, maxRecords: linkedTakeIds.length }).all();
              }

              // Compute leaderboard winner from takes and write to packWinner (linked Profile record)
              try {
                const statsList = aggregateTakeStats(takes);
                if (statsList.length > 0) {
                  const top = statsList[0];
                  const winnerPhone = top.phone;
                  if (winnerPhone) {
                    // Find the Airtable Profiles record by phone to link
                    const profileRecs = await base("Profiles").select({
                      filterByFormula: `{profileMobile} = "${winnerPhone}"`,
                      maxRecords: 1,
                    }).firstPage();
                    if (profileRecs.length > 0) {
                      const winnerProfileRecordId = profileRecs[0].id;
                      await base("Packs").update([
                        { id: pr.id, fields: { packWinner: [winnerProfileRecordId] } },
                      ]);
                      console.log(`[admin/updatePropsStatus] Pack ${pr.id} winner set to profile record ${winnerProfileRecordId}`);
                    } else {
                      console.warn(`[admin/updatePropsStatus] No profile found for winner phone ${winnerPhone}`);
                    }
                  }
                }
              } catch (winnerErr) {
                console.error("[admin/updatePropsStatus] Error computing/saving pack winner:", winnerErr);
              }
              const phones = [...new Set(takes.map(t => t.fields.takeMobile).filter(Boolean))];
              smsRecipients = phones;
              for (const to of phones) {
                try {
                  await sendSMS({ to, message: `🎉 Your pack "${packURL}" has been graded! View results: ${process.env.SITE_URL}/packs/${packURL}` });
                } catch (smsErr) {
                  console.error(`[admin/updatePropsStatus] SMS send error for ${to}:`, smsErr);
                }
              }
            }
          }
        }
      } catch (err) {
        console.error("[admin/updatePropsStatus] Error checking/updating packStatus:", err);
      }
    }

    return res.status(200).json({ success: true, smsCount: smsRecipients.length });
  } catch (error) {
    console.error("[admin/updatePropsStatus] Error:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
} 