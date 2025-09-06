import { getToken } from "next-auth/jwt";
import Airtable from "airtable";
import { sendSMS } from "../../../lib/twilioService";
import { aggregateTakeStats } from "../../../lib/leaderboard";
import { awardThresholdsForUpdatedProps } from "../../../lib/achievements";
import { getDataBackend } from "../../../lib/runtimeConfig";
import { query } from "../../../lib/db/postgres";

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
  const details = {
    updatedProps: [],
    packsProcessed: [],
    propToPacks: [],
  };
  if (!Array.isArray(updates) || updates.length === 0) {
    return res.status(400).json({ success: false, error: "Missing updates array" });
  }

  try {
    // Postgres path: update props, optionally grade related pack(s)
    if (getDataBackend() === 'postgres') {
      // Build updates for props table
      const updatedPropRecordIds = [];
      const updatedPropFieldIds = [];
      const batch = [];
      for (const u of updates) {
        const id = u.airtableId || u.id || null; // this is the PG UUID from UI
        if (!id) continue;
        updatedPropRecordIds.push(id);
        if (u.propID) updatedPropFieldIds.push(u.propID);
        const fields = { prop_status: u.propStatus };
        if (u.propResult !== undefined) fields.prop_result = u.propResult;
        // Set graded_at when transitioning to a terminal status
        if (['gradeda','gradedb','push'].includes(String(u.propStatus || '').toLowerCase())) {
          fields.graded_at = new Date().toISOString();
        }
        batch.push({ id, fields });
      }
      // Execute updates
      for (const b of batch) {
        const keys = Object.keys(b.fields);
        if (keys.length === 0) continue;
        const sets = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
        const vals = keys.map((k) => b.fields[k]);
        vals.push(b.id);
        // eslint-disable-next-line no-await-in-loop
        await query(`UPDATE props SET ${sets}, updated_at = NOW() WHERE id = $${keys.length + 1}`, vals);
      }

      // If packURL provided, locate pack and check if all props graded/pushed to set pack graded
      const detailsPacks = [];
      if (packURL) {
        const { rows: packRows } = await query('SELECT id, pack_url, title, pack_status FROM packs WHERE pack_url = $1 LIMIT 1', [packURL]);
        if (packRows.length) {
          const pk = packRows[0];
          const { rows: propRows } = await query('SELECT prop_status FROM props WHERE pack_id = $1', [pk.id]);
          const allGraded = propRows.length > 0 && propRows.every(r => ['gradedA','gradedB','push'].includes(String(r.prop_status || '').toLowerCase()));
          if (allGraded && String(pk.pack_status || '').toLowerCase() !== 'graded') {
            await query('UPDATE packs SET pack_status = $1 WHERE id = $2', ['graded', pk.id]);
          }
          detailsPacks.push({ airtableId: pk.id, packURL: pk.pack_url, packTitle: pk.title, wasGraded: allGraded, alreadyGraded: String(pk.pack_status || '').toLowerCase() === 'graded', smsSentCount: 0, smsRecipients: [], containsUpdatedPropRecordIds: updatedPropRecordIds });
        }
      }

      // Response details mirroring Airtable path shape
      details.updatedProps = updates.map(u => ({ airtableId: u.airtableId, propID: u.propID, propStatus: u.propStatus, propResult: u.propResult }));
      details.packsProcessed = detailsPacks;
      details.propToPacks = [];

      // Achievements placeholder (still Airtable-centric)
      try {
        const achievementResults = await awardThresholdsForUpdatedProps(null, updatedPropFieldIds);
        details.achievementsCreated = (achievementResults || []).filter((r) => Array.isArray(r.achievementKeys) && r.achievementKeys.length > 0);
      } catch (achErr) {
        details.achievementsError = achErr.message;
      }

      return res.status(200).json({ success: true, smsCount: 0, details });
    }
    // Prepare updates, computing final popularity percentages for graded props
    const formatted = [];
    // Collect both Airtable record IDs and business propIDs for later use
    const updatedPropRecordIds = [];
    const updatedPropFieldIds = [];
    for (const u of updates) {
      const fields = { propStatus: u.propStatus };
      if (u.propResult !== undefined) {
        fields.propResult = u.propResult;
      }
      // Accumulate updated props for response details
      details.updatedProps.push({
        airtableId: u.airtableId,
        propID: u.propID,
        propStatus: u.propStatus,
        propResult: u.propResult,
      });
      if (u.airtableId) updatedPropRecordIds.push(u.airtableId);
      if (u.propID) updatedPropFieldIds.push(u.propID);
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
    // Airtable limits update payloads to 10 records per request
    const updateChunkSize = 10;
    for (let i = 0; i < formatted.length; i += updateChunkSize) {
      const chunk = formatted.slice(i, i + updateChunkSize);
      // eslint-disable-next-line no-await-in-loop
      await base("Props").update(chunk);
    }

    // Helper: given a Pack record, if all its Props are graded/pushed,
    // mark the Pack as graded, compute winner, and send SMS notifications.
    async function gradePackAndNotifyIfComplete(packRecord, containedUpdatedPropIds = []) {
      const propIds = packRecord.fields.Props || [];
      if (propIds.length === 0) return [];

      const propFormula = `OR(${propIds.map(id => `RECORD_ID()="${id}"`).join(",")})`;
      const propRecs = await base("Props").select({ filterByFormula: propFormula, maxRecords: propIds.length }).all();
      const allGraded = propRecs.every(r => ["gradedA", "gradedB", "push"].includes(r.fields.propStatus));
      if (!allGraded) return [];

      const currentStatus = String(packRecord.fields.packStatus || "").toLowerCase();
      const packUrlField = packRecord.fields.packURL || "";

      // Update packStatus to graded if not already
      let wasGradedNow = false;
      if (currentStatus !== "graded") {
        await base("Packs").update([{ id: packRecord.id, fields: { packStatus: "graded" } }]);
        console.log(`[admin/updatePropsStatus] Pack ${packRecord.id} status set to graded`);
        wasGradedNow = true;
      }

      // Gather latest Takes linked to this pack
      const linkedTakeIds = packRecord.fields.Takes || [];
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
            const profileRecs = await base("Profiles").select({
              filterByFormula: `{profileMobile} = "${winnerPhone}"`,
              maxRecords: 1,
            }).firstPage();
            if (profileRecs.length > 0) {
              const winnerProfileRecordId = profileRecs[0].id;
              await base("Packs").update([
                { id: packRecord.id, fields: { packWinner: [winnerProfileRecordId] } },
              ]);
              console.log(`[admin/updatePropsStatus] Pack ${packRecord.id} winner set to profile record ${winnerProfileRecordId}`);
            } else {
              console.warn(`[admin/updatePropsStatus] No profile found for winner phone ${winnerPhone}`);
            }
          }
        }
      } catch (winnerErr) {
        console.error("[admin/updatePropsStatus] Error computing/saving pack winner:", winnerErr);
      }

      // Send SMS notifications to unique phones from latest takes
      const phones = [...new Set(takes.map(t => t.fields.takeMobile).filter(Boolean))];
      for (const to of phones) {
        try {
          const urlPart = packUrlField ? packUrlField : (packURL || "");
          await sendSMS({ to, message: `🎉 Your pack "${urlPart}" has been graded! View results: ${process.env.SITE_URL}/packs/${urlPart}` });
        } catch (smsErr) {
          console.error(`[admin/updatePropsStatus] SMS send error for ${to}:`, smsErr);
        }
      }
      // Push per-pack details for response logging
      details.packsProcessed.push({
        airtableId: packRecord.id,
        packURL: packUrlField,
        packTitle: packRecord.fields.packTitle || "",
        wasGraded: wasGradedNow,
        alreadyGraded: !wasGradedNow && currentStatus === "graded",
        smsSentCount: phones.length,
        smsRecipients: phones,
        containsUpdatedPropRecordIds: containedUpdatedPropIds,
      });
      return phones;
    }

    // If a specific packURL is provided, only process that pack
    if (packURL) {
      try {
        const packRecs = await base("Packs").select({
          filterByFormula: `{packURL} = "${packURL}"`,
          maxRecords: 1,
        }).firstPage();
        if (packRecs.length > 0) {
          const pr = packRecs[0];
          const phones = await gradePackAndNotifyIfComplete(pr);
          smsRecipients = phones;
        }
      } catch (err) {
        console.error("[admin/updatePropsStatus] Error checking/updating packStatus:", err);
      }
    } else {
      // No explicit packURL: find all packs by using the updated Props' packID, then fall back to linking via {Props}
      try {
        const updatedPropIds = updatedPropRecordIds; // airtable record IDs
        const updatedPackIDs = [...new Set(updates.map(u => u.packID).filter(Boolean))];
        // Build mapping for response: prop -> packs
        const propIdToPacks = new Map();
        const packsToProcess = [];

        // 1) Prefer exact join via packID
        if (updatedPackIDs.length > 0) {
          const chunkSize = 50;
          for (let i = 0; i < updatedPackIDs.length; i += chunkSize) {
            const chunk = updatedPackIDs.slice(i, i + chunkSize);
            const formula = `OR(${chunk.map(pid => `{packID} = "${pid}"`).join(',')})`;
            const recs = await base("Packs").select({ filterByFormula: formula, maxRecords: chunk.length }).all();
            packsToProcess.push(...recs);
          }
        }

        // 2) Fallback: packs that list any of the updated Prop record IDs in {Props}
        if (packsToProcess.length === 0 && updatedPropIds.length > 0) {
          const findClauses = updatedPropIds.map(id => `FIND('${id}', ARRAYJOIN({Props}))>0`);
          const formula = findClauses.length === 1 ? findClauses[0] : `OR(${findClauses.join(',')})`;
          const recs = await base("Packs").select({ filterByFormula: formula, maxRecords: 5000 }).all();
          packsToProcess.push(...recs);
        }

        // Deduplicate packs
        const seen = new Set();
        for (const packRecord of packsToProcess) {
          if (seen.has(packRecord.id)) continue;
          seen.add(packRecord.id);
          const propIdsInPack = (packRecord.fields.Props || []).filter(id => updatedPropIds.includes(id));
          // Track prop -> pack mapping for response
          for (const pid of propIdsInPack) {
            if (!propIdToPacks.has(pid)) propIdToPacks.set(pid, []);
            propIdToPacks.get(pid).push({
              airtableId: packRecord.id,
              packURL: packRecord.fields.packURL || "",
              packTitle: packRecord.fields.packTitle || "",
            });
          }
          const phones = await gradePackAndNotifyIfComplete(packRecord, propIdsInPack);
          smsRecipients.push(...phones);
        }
        // Deduplicate recipients across multiple packs
        smsRecipients = [...new Set(smsRecipients)];

        // Save prop -> packs mapping to details, preferring propID when available
        const propIdToMeta = new Map(details.updatedProps.map(p => [p.airtableId, p]));
        for (const [pid, packs] of propIdToPacks.entries()) {
          const meta = propIdToMeta.get(pid) || { propID: undefined };
          const displayPropID = meta.propID || meta.airtableId || pid;
          details.propToPacks.push({
            airtableId: pid,
            propID: displayPropID,
            packs,
          });
        }
      } catch (err) {
        console.error("[admin/updatePropsStatus] Error scanning related packs:", err);
      }
    }

    // Achievement checks should always run for the updated business propIDs
    try {
      const achievementResults = await awardThresholdsForUpdatedProps(base, updatedPropFieldIds);
      details.achievementsCreated = (achievementResults || []).filter(
        (r) => Array.isArray(r.achievementKeys) && r.achievementKeys.length > 0
      );
    } catch (achErr) {
      console.error("[admin/updatePropsStatus] Achievement processing error:", achErr);
      details.achievementsError = achErr.message;
    }

    return res.status(200).json({ success: true, smsCount: smsRecipients.length, details });
  } catch (error) {
    console.error("[admin/updatePropsStatus] Error:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
} 