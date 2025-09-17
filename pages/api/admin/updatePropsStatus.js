import { getToken } from "next-auth/jwt";
import Airtable from "airtable";
import { sendSMS } from "../../../lib/twilioService";
import { aggregateTakeStats } from "../../../lib/leaderboard";
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

        // If this update graded the prop, cascade update takes: take_result, take_pts, tokens
        const newStatusLc = String(b.fields.prop_status || '').toLowerCase();
        if (['gradeda','gradedb','push'].includes(newStatusLc)) {
          // eslint-disable-next-line no-await-in-loop
          await query(
            `UPDATE takes t
               SET take_result = CASE
                 WHEN $1 IN ('gradedA','gradedB') THEN CASE
                   WHEN $1 = 'gradedA' AND t.prop_side = 'A' THEN 'won'
                   WHEN $1 = 'gradedB' AND t.prop_side = 'B' THEN 'won'
                   ELSE 'lost'
                 END
                 WHEN $1 = 'push' THEN 'push'
                 ELSE 'pending'
               END
                , take_pts = CASE
                  WHEN $1 = 'gradedA' THEN CASE WHEN t.prop_side = 'A' THEN COALESCE(p.prop_side_a_value, 1) ELSE 0 END
                  WHEN $1 = 'gradedB' THEN CASE WHEN t.prop_side = 'B' THEN COALESCE(p.prop_side_b_value, 1) ELSE 0 END
                  WHEN $1 = 'push' THEN 100
                  ELSE 0
                END
               , tokens = (CASE
                  WHEN $1 = 'gradedA' THEN CASE WHEN t.prop_side = 'A' THEN COALESCE(p.prop_side_a_value, 1) ELSE 0 END
                  WHEN $1 = 'gradedB' THEN CASE WHEN t.prop_side = 'B' THEN COALESCE(p.prop_side_b_value, 1) ELSE 0 END
                  WHEN $1 = 'push' THEN 100
                  ELSE 0
                END) * 0.05
             FROM props p
            WHERE t.prop_id = p.id
              AND p.id = $2
              AND t.take_status = 'latest'`,
            [newStatusLc === 'gradeda' ? 'gradedA' : newStatusLc === 'gradedb' ? 'gradedB' : 'push', b.id]
          );
        }
      }

      // Identify packs touched by these prop updates and compute remaining/ungraded counts.
      const detailsPacks = [];
      try {
        // Find pack memberships for updated props
        const { rows: packLinks } = await query(
          'SELECT id AS prop_id, pack_id FROM props WHERE id = ANY($1::uuid[])',
          [updatedPropRecordIds]
        );
        const packIdSet = new Set((packLinks || []).map(r => r.pack_id).filter(Boolean));
        for (const packId of packIdSet) {
          // Load pack basic info
          const { rows: pr } = await query('SELECT id, pack_url, title, pack_status FROM packs WHERE id = $1 LIMIT 1', [packId]);
          if (!pr || pr.length === 0) continue;
          const pk = pr[0];
          // Count total and ungraded props in pack
          const { rows: counts } = await query(
            `SELECT
               COUNT(*)::int AS total,
               COUNT(*) FILTER (WHERE LOWER(COALESCE(prop_status,'')) NOT IN ('gradeda','gradedb','push'))::int AS ungraded
             FROM props WHERE pack_id = $1`,
            [packId]
          );
          const total = counts && counts[0] ? Number(counts[0].total) : 0;
          const ungraded = counts && counts[0] ? Number(counts[0].ungraded) : 0;
          const prevStatus = String(pk.pack_status || '').toLowerCase();
          let wasGradedNow = false;
          if (total > 0 && ungraded === 0 && prevStatus !== 'graded') {
            await query('UPDATE packs SET pack_status = $1 WHERE id = $2', ['graded', packId]);
            wasGradedNow = true;
          }
          // If the pack just transitioned to graded, notify all participants (distinct latest take mobiles)
          let smsRecipientsForPack = [];
          if (wasGradedNow) {
            try {
              const { rows: tr } = await query(
                `SELECT DISTINCT take_mobile
                   FROM takes
                  WHERE pack_id = $1
                    AND take_status = 'latest'
                    AND take_mobile IS NOT NULL`,
                [packId]
              );
              const phones = (tr || []).map(r => r.take_mobile).filter(Boolean);
              const urlPart = pk.pack_url || '';
              for (const to of phones) {
                try {
                  await sendSMS({ to, message: `🎉 Your pack "${urlPart}" has been graded! View results: ${process.env.SITE_URL}/packs/${urlPart}` });
                } catch (smsErr) {
                  console.error(`[admin/updatePropsStatus PG] SMS send error for ${to}:`, smsErr);
                }
              }
              smsRecipientsForPack = phones;
            } catch (e) {
              console.error('[admin/updatePropsStatus PG] failed to fetch/send SMS to participants', e?.message || e);
            }
          }
          detailsPacks.push({
            airtableId: pk.id,
            packURL: pk.pack_url,
            packTitle: pk.title,
            wasGraded: wasGradedNow,
            alreadyGraded: !wasGradedNow && prevStatus === 'graded',
            smsSentCount: smsRecipientsForPack.length,
            smsRecipients: smsRecipientsForPack,
            containsUpdatedPropRecordIds: updatedPropRecordIds,
            ungradedRemaining: ungraded,
            totalProps: total,
          });
        }
      } catch (e) {
        console.error('[admin/updatePropsStatus PG] pack rollup failed', e?.message || e);
      }

      // Response details mirroring Airtable path shape
      details.updatedProps = updates.map(u => ({ airtableId: u.airtableId, propID: u.propID, propStatus: u.propStatus, propResult: u.propResult }));
      details.packsProcessed = detailsPacks;
      // Build prop -> pack mapping for response
      try {
        const { rows: mapRows } = await query(
          `SELECT p.id AS prop_id, p.prop_id AS prop_text_id, pk.id AS pack_id, pk.pack_url, pk.title
             FROM props p
             JOIN packs pk ON pk.id = p.pack_id
            WHERE p.id = ANY($1::uuid[])`,
          [updatedPropRecordIds]
        );
        const byProp = new Map();
        for (const r of mapRows || []) {
          const key = r.prop_id;
          if (!byProp.has(key)) byProp.set(key, []);
          byProp.get(key).push({ airtableId: r.pack_id, packURL: r.pack_url || '', packTitle: r.title || '' });
        }
        const propMeta = new Map(details.updatedProps.map(p => [p.airtableId, p]));
        details.propToPacks = Array.from(byProp.entries()).map(([propUUID, packs]) => {
          const meta = propMeta.get(propUUID) || {};
          return { airtableId: propUUID, propID: meta.propID || propUUID, packs };
        });
      } catch (e) {
        console.error('[admin/updatePropsStatus PG] prop->pack mapping failed', e?.message || e);
        details.propToPacks = [];
      }

      // Achievements removed

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

    // Achievements removed

    return res.status(200).json({ success: true, smsCount: smsRecipients.length, details });
  } catch (error) {
    console.error("[admin/updatePropsStatus] Error:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
} 