// File: /pages/api/packs/index.js
 
import { getToken } from "next-auth/jwt";
import { query } from "../../../lib/db/postgres";
import { createRepositories } from "../../../lib/dal/factory";
import { getCurrentUser } from "../../../lib/auth";
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
      const seriesID = (req.query.seriesID ? String(req.query.seriesID) : '').trim() || null;

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
                  p.pack_open_sms_template,
                  p.event_id,
                  p.creator_profile_id,
                  e.event_time,
                  e.title AS event_title
           FROM packs p
           LEFT JOIN events e ON e.id = p.event_id
            WHERE (
              $2::boolean = TRUE
              OR p.pack_status IN ('active','open','graded','coming-soon','draft','live','pending-grade')
              OR p.pack_status IS NULL
            )
            AND (
              $3::text IS NULL
              OR EXISTS (
                SELECT 1
                  FROM series s
                  JOIN series_packs spx ON spx.series_id = s.id
                 WHERE spx.pack_id = p.id AND (s.series_id = $3 OR s.id::text = $3)
              )
            )
            ORDER BY p.created_at DESC NULLS LAST
            LIMIT CASE WHEN $2::boolean = TRUE THEN 500 ELSE 80 END
         ),
         events_for_pack AS (
           SELECT sp.id AS pack_id,
                  json_agg(
                    json_build_object(
                      'id', e.id::text,
                      'espnGameID', e.espn_game_id,
                      'league', e.league,
                      'title', e.title,
                      'eventTime', COALESCE(e.event_time::text, NULL)
                    )
                    ORDER BY e.event_time ASC NULLS LAST
                  ) AS events
             FROM selected_packs sp
             LEFT JOIN (
               SELECT DISTINCT pe.pack_id, e.id, e.espn_game_id, e.league, e.title, e.event_time
                 FROM packs_events pe
                 JOIN events e ON e.id = pe.event_id
               UNION
               SELECT DISTINCT p.id AS pack_id, e.id, e.espn_game_id, e.league, e.title, e.event_time
                 FROM packs p
                 JOIN events e ON e.id = p.event_id
             ) ev ON ev.pack_id = sp.id
             LEFT JOIN events e ON e.id = ev.id
            GROUP BY sp.id
         ),
         series_for_pack AS (
           SELECT sp.id AS pack_id,
                  json_agg(DISTINCT jsonb_build_object(
                    'id', s.id,
                    'seriesId', s.series_id,
                    'title', s.title
                  )) FILTER (WHERE s.id IS NOT NULL) AS series
             FROM selected_packs sp
             LEFT JOIN series_packs spx ON spx.pack_id = sp.id
             LEFT JOIN series s ON s.id = spx.series_id
            GROUP BY sp.id
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
         ),
         -- Compute top taker (by points) for each graded pack
         latest_takes AS (
           SELECT t.*
             FROM takes t
             JOIN selected_packs sp ON sp.id = t.pack_id
            WHERE t.take_status = 'latest'
         ),
         take_points AS (
           SELECT lt.pack_id,
                  lt.take_mobile,
                  SUM(
                    CASE
                      WHEN pr.prop_status IN ('gradedA','gradedB') THEN
                        CASE
                          WHEN pr.prop_status = 'gradedA' AND lt.prop_side = 'A' THEN COALESCE(pr.prop_side_a_value, 1)
                          WHEN pr.prop_status = 'gradedB' AND lt.prop_side = 'B' THEN COALESCE(pr.prop_side_b_value, 1)
                          ELSE 0
                        END
                      WHEN pr.prop_status = 'push' THEN 100
                      ELSE 0
                    END
                  )::int AS points
             FROM latest_takes lt
             JOIN props pr ON pr.id = lt.prop_id
            GROUP BY lt.pack_id, lt.take_mobile
         ),
         top_taker AS (
           SELECT tp.pack_id,
                  tp.take_mobile,
                  tp.points,
                  ROW_NUMBER() OVER (PARTITION BY tp.pack_id ORDER BY tp.points DESC NULLS LAST) AS rn
             FROM take_points tp
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
                sp.pack_open_sms_template,
                sp.event_id,
                sp.event_time::text AS event_time,
                sp.event_title,
                sp.creator_profile_id,
                pr.profile_id AS creator_profile_handle,
               efp.events AS events,
                COALESCE(pa.props_count, 0) AS props_count,
                COALESCE(ta.total_count, 0) AS total_take_count,
                COALESCE(ta.user_count, 0) AS user_take_count,
                CASE WHEN LOWER(COALESCE(sp.pack_status,'')) = 'graded' THEN tp.points ELSE NULL END AS winner_points,
                CASE WHEN LOWER(COALESCE(sp.pack_status,'')) = 'graded' THEN prf.profile_id ELSE NULL END AS winner_profile_id
           FROM selected_packs sp
           LEFT JOIN props_agg pa ON pa.pack_id = sp.id
           LEFT JOIN takes_agg ta ON ta.pack_id = sp.id
           LEFT JOIN top_taker tt ON tt.pack_id = sp.id AND tt.rn = 1
           LEFT JOIN profiles prf ON prf.mobile_e164 = tt.take_mobile
           LEFT JOIN take_points tp ON tp.pack_id = tt.pack_id AND tp.take_mobile = tt.take_mobile
           LEFT JOIN events_for_pack efp ON efp.pack_id = sp.id
           LEFT JOIN series_for_pack sfp ON sfp.pack_id = sp.id
           LEFT JOIN profiles pr ON pr.id = sp.creator_profile_id`,
        [userPhone, includeAll, seriesID]
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
        packOpenSmsTemplate: r.pack_open_sms_template || null,
        eventTime: toIso(r.event_time),
        firstPlace: "",
        createdAt: toIso(r.created_at) || null,
        creatorProfileId: r.creator_profile_id || null,
        creatorProfileHandle: r.creator_profile_handle || null,
        propsCount: Number(r.props_count || 0),
        winnerProfileID: r.winner_profile_id || null,
        winnerPoints: (r.winner_points == null ? null : Number(r.winner_points)),
        packWinnerRecordIds: [],
        takeCount: Number(r.total_take_count || 0),
        userTakesCount: Number(r.user_take_count || 0),
        events: Array.isArray(r.events)
          ? r.events.map((e) => ({
              id: e.id || null,
              espnGameID: e.espnGameID || null,
              league: e.league || null,
              title: e.title || null,
              eventTime: toIso(e.eventTime) || null,
            }))
          : [],
        seriesList: Array.isArray(r.series)
          ? r.series.map((s) => ({ id: s.id || null, series_id: s.seriesId || null, title: s.title || null }))
          : [],
      }));

      // Readable, emoji-enhanced summary for terminal
      try {
        const statusEmoji = (s) => {
          const v = String(s || '').toLowerCase().replace(/\s+/g, '-');
          if (v === 'open' || v === 'active') return '🟢 open';
          if (v === 'coming-soon' || v === 'coming-up') return '🟠 coming-soon';
          if (v === 'closed') return '🔴 closed';
          if (v === 'live') return '🟣 live';
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
          try {
            const toPathLeague = (lg) => {
              const v = String(lg || '').toLowerCase();
              switch (v) {
                case 'mlb': return 'baseball/mlb';
                case 'nba': return 'basketball/nba';
                case 'nfl': return 'football/nfl';
                case 'nhl': return 'hockey/nhl';
                case 'ncaam': return 'basketball/mens-college-basketball';
                case 'ncaaw': return 'basketball/womens-college-basketball';
                case 'ncaaf': return 'football/college-football';
                default: return `baseball/${v}`;
              }
            };
            const events = Array.isArray(p?.events) ? p.events : [];
            if (events.length > 0) {
              console.log('  🎯 events:');
              events.forEach((ev) => {
                const espnId = ev?.espnGameID || ev?.espn || ev?.id || '';
                const league = ev?.league || p?.packLeague || '';
                if (!espnId || !league) {
                  console.log('    - (missing league or espn id)');
                  return;
                }
                const pathLeague = toPathLeague(league);
                const localUrl = `/api/scores?league=${league}&event=${espnId}`;
                const espnSummary = `https://site.api.espn.com/apis/site/v2/sports/${pathLeague}/summary?event=${espnId}`;
                console.log(`    - getting the espn id: ${espnId} (${league})`);
                console.log(`      ↳ local: ${localUrl}`);
                console.log(`      ↳ espn:  ${espnSummary}`);
              });
            }
          } catch {}
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
    try {
      const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
      if (!token) {
        return res.status(401).json({ success: false, error: "Unauthorized" });
      }
      const ident = String(
        req.query.packId ||
          req.query.packURL ||
          (req.body && (req.body.packId || req.body.packURL)) ||
          ""
      ).trim();
      if (!ident) {
        return res.status(400).json({ success: false, error: "Missing packId or packURL" });
      }

      // Resolve to canonical UUID id
      const { rows: pRows } = await query(
        `SELECT id FROM packs WHERE id::text = $1 OR pack_id = $1 OR pack_url = $1 LIMIT 1`,
        [ident]
      );
      if (!pRows || pRows.length === 0) {
        return res.status(404).json({ success: false, error: "Pack not found" });
      }
      const packUUID = pRows[0].id;

      // Perform deletions in a transaction to avoid FK violations
      await query('BEGIN');
      try {
        // Delete takes tied to this pack or any props in this pack
        await query(
          `DELETE FROM takes WHERE pack_id = $1 OR prop_id IN (SELECT id FROM props WHERE pack_id = $1)`,
          [packUUID]
        );
        // Delete props belonging to this pack
        await query(`DELETE FROM props WHERE pack_id = $1`, [packUUID]);
        // packs_events and contests_packs have ON DELETE CASCADE on pack_id
        await query(`DELETE FROM packs WHERE id = $1`, [packUUID]);
        await query('COMMIT');
      } catch (txErr) {
        await query('ROLLBACK').catch(() => {});
        throw txErr;
      }

      return res.status(200).json({ success: true });
    } catch (error) {
      console.error("[api/packs DELETE PG] Error =>", error);
      return res.status(500).json({ success: false, error: "Failed to delete pack" });
    }
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
      const currentUser = await getCurrentUser(req);
      if (!currentUser?.userId) {
        return res.status(401).json({ success: false, error: "Unauthorized" });
      }
      const { packTitle, packSummary, packURL, packType, packLeague, packStatus, packOpenTime, packCloseTime, event, eventId, events, teams, packCoverUrl, props, packCreator, firstPlace, packOpenSmsTemplate } = req.body;
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
        packOpenSmsTemplate,
        eventId: finalEventId,
        events, props,
        creatorProfileId: currentUser.userId,
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
