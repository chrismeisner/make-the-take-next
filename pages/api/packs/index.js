// File: /pages/api/packs/index.js
 
import { getToken } from "next-auth/jwt";
import { query } from "../../../lib/db/postgres";
import { createRepositories } from "../../../lib/dal/factory";
import { withRouteTiming } from "../../../lib/timing";

// Ensure all timestamps are serialized as ISO 8601 UTC strings
const toIso = (t) => (t ? new Date(t).toISOString() : null);

// Airtable helpers removed; Postgres-only

async function handler(req, res) {
  // Postgres path for GET
  if (req.method === "GET") {
    try {
      const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
      const userPhone = token?.phone || null;
      const includeAll = String(req.query.includeAll || '').trim() === '1';

      // Ensure all timestamps returned to the client are ISO 8601 UTC strings
      const toIso = (t) => (t ? new Date(t).toISOString() : null);

      // Single round-trip aggregate using CTEs to reduce latency and pool pressure
      const { rows: packRows } = await query(
        `WITH selected_packs AS (
           SELECT p.id,
                  p.pack_id,
                  p.pack_url,
                  p.title,
                  p.summary,
                  p.prize,
                  p.cover_url,
                  p.league,
                  p.created_at,
                  p.pack_status,
                  p.pack_open_time,
                  p.pack_close_time,
                  p.event_id,
                  e.event_time,
                  e.title AS event_title
             FROM packs p
             LEFT JOIN events e ON e.id = p.event_id
            WHERE $2::boolean = TRUE OR p.pack_status IN ('active','graded','coming-soon','draft') OR p.pack_status IS NULL
            ORDER BY p.created_at DESC NULLS LAST
            LIMIT CASE WHEN $2::boolean = TRUE THEN 500 ELSE 80 END
         ),
         takes_agg AS (
           SELECT t.pack_id,
                  COUNT(*) FILTER (WHERE t.take_status = 'latest')::int AS total_count,
                  COUNT(*) FILTER (WHERE t.take_status = 'latest' AND t.take_mobile = $1)::int AS user_count
             FROM takes t
             JOIN selected_packs sp ON sp.id = t.pack_id
            GROUP BY t.pack_id
         ),
         props_agg AS (
           SELECT p.pack_id,
                  COUNT(*)::int AS props_count,
                  MIN(p.open_time) AS open_time,
                  MAX(p.close_time) AS close_time
             FROM props p
             JOIN selected_packs sp ON sp.id = p.pack_id
            GROUP BY p.pack_id
         )
         SELECT sp.id,
                sp.pack_id,
                sp.pack_url,
                sp.title,
                sp.summary,
                sp.prize,
                sp.cover_url,
                sp.league,
                sp.created_at,
                sp.pack_status,
                COALESCE(sp.pack_open_time::text, pa.open_time::text) AS pack_open_time,
                COALESCE(sp.pack_close_time::text, pa.close_time::text) AS pack_close_time,
                sp.event_id,
                sp.event_time::text AS event_time,
                sp.event_title,
                COALESCE(pa.props_count, 0) AS props_count,
                COALESCE(ta.total_count, 0) AS total_take_count,
                COALESCE(ta.user_count, 0) AS user_take_count
           FROM selected_packs sp
           LEFT JOIN props_agg pa ON pa.pack_id = sp.id
           LEFT JOIN takes_agg ta ON ta.pack_id = sp.id`,
        [userPhone, includeAll]
      );

      const packsData = packRows.map((r) => ({
        airtableId: r.id,
        eventId: r.event_id || null,
        eventTitle: r.event_title || null,
        propEventRollup: [],
        packID: r.pack_id || r.id,
        packTitle: r.title || "Untitled Pack",
        packURL: r.pack_url || "",
        packCover: r.cover_url || null,
        packPrize: r.prize || "",
        prizeSummary: "",
        packSummary: r.summary || "",
        packType: "",
        packLeague: r.league || null,
        packStatus: r.pack_status || "",
        packOpenTime: toIso(r.pack_open_time) || null,
        packCloseTime: toIso(r.pack_close_time) || null,
        eventTime: toIso(r.event_time),
        firstPlace: "",
        createdAt: toIso(r.created_at) || null,
        propsCount: Number(r.props_count || 0),
        winnerProfileID: null,
        packWinnerRecordIds: [],
        takeCount: Number(r.total_take_count || 0),
        userTakesCount: Number(r.user_take_count || 0),
      }));

      // Readable, emoji-enhanced summary for terminal
      try {
        const statusEmoji = (s) => {
          const v = String(s || '').toLowerCase().replace(/\s+/g, '-');
          if (v === 'open' || v === 'active') return '🟢 open';
          if (v === 'coming-soon' || v === 'coming-up') return '🟠 coming-soon';
          if (v === 'closed') return '🔴 closed';
          if (v === 'completed') return '⚫ completed';
          if (v === 'graded') return '🔵 graded';
          return '⚪ unknown';
        };
        const fmt = (t) => (t ? new Date(t).toISOString() : '—');
        const yesNo = (v) => (v ? '✅' : '❌');
        console.log(`\n=== /api/packs [postgres] count=${packsData.length} ===`);
        packsData.slice(0, 20).forEach((p, i) => {
          const coverUrl = Array.isArray(p?.packCover) && p.packCover.length > 0
            ? p.packCover[0]?.url
            : (typeof p?.packCover === 'string' ? p.packCover : null);
          console.log(`\n#${String(i + 1).padStart(2, '0')} ${p.packURL ? `(${p.packURL})` : ''}`);
          console.log(`  🆔 id: ${p.packID || p.id || p.airtableId}`);
          console.log(`  📛 title: ${p.packTitle || 'Untitled'}`);
          console.log(`  🏷️ league: ${p.packLeague || '—'}`);
          console.log(`  📊 status: ${statusEmoji(p.packStatus)}`);
          console.log(`  🧩 props: ${p.propsCount ?? 0}`);
          console.log(`  👥 takes: ${p.takeCount ?? 0} total, ${p.userTakesCount ?? 0} you`);
          console.log(`  🕒 window: ${fmt(p.packOpenTime)} → ${fmt(p.packCloseTime)}`);
          console.log(`  🖼️ cover: ${yesNo(!!coverUrl)}`);
        });
      } catch (logErr) {
        console.warn('[api/packs PG] pretty log failed =>', logErr?.message || logErr);
      }

      return res.status(200).json({ success: true, packs: packsData });
    } catch (error) {
      console.error("[api/packs PG] Error =>", error);
      return res.status(500).json({ success: false, error: "Failed to fetch packs." });
    }
  }
 
  if (req.method === "DELETE") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }
  if (req.method === "PATCH") {
    // Update pack fields
    const { packId, packURL } = req.body;
    if (!packId && !packURL) {
      return res.status(400).json({ success: false, error: "Missing packId or packURL" });
    }
    try {
      // Prefer DAL when packURL is provided
      if (packURL) {
        const { packs } = createRepositories();
        // If multiple events are provided, set primary event_id from first UUID
        let primaryEventId = null;
        if (Array.isArray(req.body?.events) && req.body.events.length > 0) {
          const firstUuid = req.body.events.find((e) => typeof e === 'string' && !e.startsWith('rec')) || null;
          if (firstUuid) primaryEventId = firstUuid;
        }

        const updateFields = { ...(req.body || {}) };
        if (primaryEventId) updateFields.event_id = primaryEventId;

        const updated = await packs.updateByPackURL(packURL, updateFields);
        // If client provided a props[] list, sync membership to this pack
        if (Array.isArray(req.body?.props)) {
          try {
            const packUUID = updated?.id;
            if (packUUID) {
              // Fetch current prop ids linked to this pack
              const { rows: existingRows } = await query('SELECT id FROM props WHERE pack_id = $1', [packUUID]);
              const existing = new Set(existingRows.map(r => r.id));
              const desired = new Set(req.body.props.filter((x) => typeof x === 'string' && x));
              const toLink = [...desired].filter((id) => !existing.has(id));
              const toUnlink = [...existing].filter((id) => !desired.has(id));
              if (toLink.length > 0) {
                await query('UPDATE props SET pack_id = $1, updated_at = NOW() WHERE id = ANY($2::uuid[])', [packUUID, toLink]);
              }
              if (toUnlink.length > 0) {
                await query('UPDATE props SET pack_id = NULL, updated_at = NOW() WHERE id = ANY($1::uuid[]) AND pack_id = $2', [toUnlink, packUUID]);
              }
            }
          } catch (mErr) {
            console.error('[api/packs PATCH PG] props membership sync failed =>', mErr?.message || mErr);
          }
        }

        // Sync packs_events many-to-many links if events[] provided
        if (Array.isArray(req.body?.events)) {
          try {
            const packUUID = updated?.id;
            if (packUUID) {
              const desired = req.body.events
                .filter((e) => typeof e === 'string' && !e.startsWith('rec'));
              // Fetch existing event links
              const { rows: existingRows } = await query('SELECT event_id FROM packs_events WHERE pack_id = $1', [packUUID]);
              const existing = new Set(existingRows.map(r => r.event_id));
              const desiredSet = new Set(desired);
              const toLink = desired.filter((id) => !existing.has(id));
              const toUnlink = [...existing].filter((id) => !desiredSet.has(id));
              if (toLink.length > 0) {
                const values = toLink.map((_, i) => `($1, $${i + 2})`).join(',');
                await query(
                  `INSERT INTO packs_events (pack_id, event_id) VALUES ${values}
                   ON CONFLICT (pack_id, event_id) DO NOTHING`,
                  [packUUID, ...toLink]
                );
              }
              if (toUnlink.length > 0) {
                await query('DELETE FROM packs_events WHERE pack_id = $1 AND event_id = ANY($2::uuid[])', [packUUID, toUnlink]);
              }
            }
          } catch (m2mErr) {
            console.error('[api/packs PATCH PG] packs_events sync failed =>', m2mErr?.message || m2mErr);
          }
        }
        return res.status(200).json({ success: true, record: updated });
      }

      return res.status(405).json({ success: false, error: "Method not allowed" });
    } catch (error) {
      console.error("[api/packs PATCH] Error =>", error);
      const msg = error.message || "Failed to update pack";
      return res.status(500).json({ success: false, error: msg });
    }
  }
  if (req.method === "POST") {
    try {
      const { packTitle, packSummary, packURL, packType, packLeague, packStatus, packOpenTime, packCloseTime, event, eventId, events, teams, packCoverUrl, props, packCreator, firstPlace } = req.body;
      // Prize can be provided directly or aliased from firstPlace
      const prize = (req.body && (req.body.prize || firstPlace)) || null;
      if (!packTitle || !packURL) {
        return res.status(400).json({ success: false, error: "Missing required fields: packTitle and packURL" });
      }

      const { packs } = createRepositories();
      // Direct Postgres-only: eventId must be a UUID if provided
      let finalEventId = null;
      let derivedLeague = null;
      if (eventId && typeof eventId === 'string' && !eventId.startsWith('rec')) {
        finalEventId = eventId;
      } else if (Array.isArray(events) && events.length > 0) {
        const candidate = events.find((e) => typeof e === 'string' && !e.startsWith('rec'));
        if (candidate) finalEventId = candidate;
      }
      if (finalEventId) {
        try {
          const { rows } = await query('SELECT league FROM events WHERE id = $1 LIMIT 1', [finalEventId]);
          const leagueVal = rows?.[0]?.league || null;
          if (leagueVal) derivedLeague = String(leagueVal).toLowerCase();
        } catch (e) {
          console.warn('[api/packs POST] Failed to derive league from Postgres event =>', e?.message || e);
        }
      }

      // Prefer DAL create in both backends
      const created = await packs.createOne({
        packTitle, packSummary, packURL, packType,
        packLeague: (packLeague ? String(packLeague).toLowerCase() : null) || derivedLeague || null,
        packStatus,
        packOpenTime, packCloseTime, packCoverUrl,
        prize,
        eventId: finalEventId,
        events, props,
      });
      // Removed Airtable dual-write
      return res.status(200).json({ success: true, record: created });
    } catch (error) {
      console.error("[api/packs POST] Error =>", error);
      // Return the underlying error message if available
      const msg = error.message || "Failed to create pack.";
      return res.status(500).json({ success: false, error: msg });
    }
  }
  // Fallback for unsupported methods
  return res.status(405).json({ success: false, error: "Method not allowed" });
}

export default withRouteTiming('/api/packs', handler);
