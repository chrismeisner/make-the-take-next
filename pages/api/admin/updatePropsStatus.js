import { getToken } from "next-auth/jwt";
import { sendSMS } from "../../../lib/twilioService";
import { query } from "../../../lib/db/postgres";

// Airtable has been removed. Postgres is the exclusive backend.

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
    // Postgres: update props, cascade to takes, and grade packs when complete
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
              // Track global recipients across packs (dedup later)
              smsRecipients.push(...phones);
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

      // Deduplicate recipients across all packs and return accurate count
      smsRecipients = [...new Set(smsRecipients)];
      return res.status(200).json({ success: true, smsCount: smsRecipients.length, details });
  } catch (error) {
    console.error("[admin/updatePropsStatus] Error:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
} 