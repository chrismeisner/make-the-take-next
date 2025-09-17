// File: /pages/api/props/index.js
import fetch from "node-fetch";
import Airtable from "airtable";
import { getDataBackend } from "../../../lib/runtimeConfig";
import { query } from "../../../lib/db/postgres";
import { createRepositories } from "../../../lib/dal/factory";

/**
 * This version uses Airtable's REST API (instead of the Airtable.js client),
 * allowing you to pass `?limit=10` and `?offset=xyz` to do server-side pagination.
 *
 * Example usage:
 *  GET /api/props?limit=10
 *  => returns up to 10 records plus a `nextOffset` if more exist
 *  GET /api/props?limit=10&offset=itrx12345
 *  => returns the next 10
 */
export default async function handler(req, res) {
  // Postgres POST path
  if (req.method === "POST" && getDataBackend() === 'postgres') {
    try {
      const {
        propShort,
        propSummary,
        PropSideAShort,
        PropSideBShort,
        PropSideATake, // ignored in PG schema for now
        PropSideBTake, // ignored in PG schema for now
        propType,
        propStatus,
        packId,
        propOrder,
        teams,
        propValueModel, // ignored in PG schema for now
        PropSideAMoneyline,
        PropSideBMoneyline,
        propCover, // cover URL if uploaded (custom)
        propCoverSource, // event | homeTeam | awayTeam | custom
        propOpenTime,
        propCloseTime,
        gradingMode,
        formulaKey,
        formulaParams,
        eventId,
      } = req.body || {};

      if (!propShort || (!packId && !eventId)) {
        return res.status(400).json({ success: false, error: "Missing propShort or packId/eventId" });
      }

      const moneylineA = (PropSideAMoneyline !== undefined && PropSideAMoneyline !== "") ? parseInt(PropSideAMoneyline, 10) : null;
      const moneylineB = (PropSideBMoneyline !== undefined && PropSideBMoneyline !== "") ? parseInt(PropSideBMoneyline, 10) : null;

      // Compute per-side values from American moneylines
      const computeMoneylineValue = (n) => {
        if (!Number.isFinite(n) || n === 0) return null;
        const raw = n > 0 ? (n / 100) * 250 : (100 / Math.abs(n)) * 250;
        return Math.round(raw);
      };
      const valueA = computeMoneylineValue(moneylineA);
      const valueB = computeMoneylineValue(moneylineB);

      const toIso = (t) => (t ? new Date(t).toISOString() : null);

      // Prepare JSONB for formula_params
      let formulaParamsJson = null;
      if (formulaParams !== undefined && formulaParams !== null && formulaParams !== "") {
        if (typeof formulaParams === 'string') {
          try { formulaParamsJson = JSON.parse(formulaParams); } catch { formulaParamsJson = { raw: String(formulaParams) }; }
        } else {
          formulaParamsJson = formulaParams;
        }
      }

      // Generate short external id for prop_id (12-hex)
      const { rows: idRows } = await query("SELECT LEFT(ENCODE(gen_random_bytes(9),'hex'),12) AS pid");
      const generatedPropId = idRows?.[0]?.pid || null;

      const { props } = createRepositories();

      // Resolve cover URL from source if not provided directly
      const normalizeSource = (s) => {
        const v = String(s || '').toLowerCase();
        if (v === 'hometeam') return 'homeTeam';
        if (v === 'awayteam') return 'awayTeam';
        if (v === 'custom') return 'custom';
        return v === 'event' ? 'event' : null;
      };
      async function resolvePackEventId(pId) {
        if (!pId) return null;
        try {
          const { rows } = await query(
            `SELECT event_id FROM packs WHERE id::text = $1 OR pack_id = $1 OR pack_url = $1 LIMIT 1`,
            [String(pId)]
          );
          return rows?.[0]?.event_id || null;
        } catch { return null; }
      }
      async function resolveCoverUrl(src, evId) {
        if (!src) return null;
        if (src === 'custom') return propCover || null;
        const eventLookupId = evId || null;
        if (!eventLookupId) return null;
        try {
          const { rows } = await query(
            `SELECT e.cover_url,
                    ht.logo_url AS home_logo,
                    at.logo_url AS away_logo
               FROM events e
          LEFT JOIN teams ht ON e.home_team_id = ht.id
          LEFT JOIN teams at ON e.away_team_id = at.id
              WHERE e.id::text = $1 OR e.event_id = $1 OR e.espn_game_id = $1
              LIMIT 1`,
            [String(eventLookupId)]
          );
          const r = rows?.[0];
          if (!r) return null;
          if (src === 'event') return r.cover_url || null;
          if (src === 'homeTeam') return r.home_logo || null;
          if (src === 'awayTeam') return r.away_logo || null;
          return null;
        } catch { return null; }
      }

      let coverUrlResolved = null;
      const src = normalizeSource(propCoverSource);
      if (propCover && typeof propCover === 'string') {
        coverUrlResolved = propCover;
      } else if (src) {
        let evId = eventId || null;
        if (!evId && packId) {
          evId = await resolvePackEventId(packId);
        }
        coverUrlResolved = await resolveCoverUrl(src, evId);
      }
      // If creating inside a pack and no explicit order provided, append to the back
      let computedPropOrder = null;
      try {
        if (packId && !(typeof propOrder === 'number')) {
          const { rows: orderRows } = await query(
            'SELECT COALESCE(MAX(prop_order), -1) AS max_order FROM props WHERE pack_id = $1',
            [packId]
          );
          const maxOrder = Number(orderRows?.[0]?.max_order);
          computedPropOrder = Number.isFinite(maxOrder) ? (maxOrder + 1) : 0;
        }
      } catch (e) {
        // leave computedPropOrder as null on error
      }
      const created = await props.createOne({
        prop_id: generatedPropId,
        prop_short: propShort,
        prop_summary: propSummary || null,
        prop_type: propType || null,
        prop_status: propStatus ?? 'open',
        pack_id: packId || null,
        event_id: eventId || null,
        side_count: 2,
        moneyline_a: Number.isFinite(moneylineA) ? moneylineA : null,
        moneyline_b: Number.isFinite(moneylineB) ? moneylineB : null,
        prop_side_a_value: Number.isFinite(valueA) ? valueA : null,
        prop_side_b_value: Number.isFinite(valueB) ? valueB : null,
        open_time: toIso(propOpenTime),
        close_time: toIso(propCloseTime),
        grading_mode: gradingMode || null,
        formula_key: formulaKey || null,
        formula_params: formulaParamsJson,
        cover_url: coverUrlResolved || null,
        prop_order: typeof propOrder === 'number' ? propOrder : computedPropOrder,
        PropSideAShort: PropSideAShort || null,
        PropSideBShort: PropSideBShort || null,
        PropSideATake: PropSideATake || null,
        PropSideBTake: PropSideBTake || null,
      });

      // Link teams if provided (props_teams join table)
      if (Array.isArray(teams) && teams.length) {
        const validTeamIds = teams.filter((t) => typeof t === 'string');
        if (validTeamIds.length) {
          const values = validTeamIds.map((_, i) => `($1, $${i + 2})`).join(',');
          try {
            await query(
              `INSERT INTO props_teams (prop_id, team_id) VALUES ${values}
               ON CONFLICT (prop_id, team_id) DO NOTHING`,
              [created.id, ...validTeamIds]
            );
          } catch (e) {
            // non-fatal
            // eslint-disable-next-line no-console
            console.warn('[api/props POST PG] linking props_teams failed =>', e?.message || e);
          }
        }
      }

      return res.status(200).json({ success: true, record: created });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[api/props POST PG] Error =>", err);
      return res.status(500).json({ success: false, error: "Failed to create prop" });
    }
  }
  // Postgres GET path
  if (req.method === "GET" && getDataBackend() === 'postgres') {
    try {
      const limitRaw = parseInt(req.query.limit || "10", 10);
      const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 100) : 10;
      const offsetRaw = parseInt(req.query.offset || "0", 10);
      const offset = Number.isFinite(offsetRaw) ? Math.max(offsetRaw, 0) : 0;

      const { rows } = await query(
        `SELECT p.id, p.prop_id, p.prop_short, p.prop_summary, p.prop_status,
                p.pack_id, p.event_id, p.side_count, p.moneyline_a, p.moneyline_b,
                p.open_time, p.close_time, p.grading_mode, p.formula_key, p.formula_params,
                p.cover_url, p.prop_order, p.created_at, p.updated_at,
                p.prop_side_a_short, p.prop_side_b_short,
                p.prop_side_a_value, p.prop_side_b_value,
                e.title AS event_title, e.event_time, e.league AS event_league
           FROM props p
      LEFT JOIN events e ON p.event_id = e.id
       ORDER BY p.prop_id
          LIMIT $1 OFFSET $2`,
        [limit, offset]
      );

      const propsData = rows.map((r) => ({
        airtableId: r.id,
        propID: r.prop_id,
        propTitle: "Untitled",
        propSummary: r.prop_summary || "",
        propStatus: r.prop_status || "open",
        PropSideAShort: r.prop_side_a_short || "",
        PropSideBShort: r.prop_side_b_short || "",
        propShort: r.prop_short || "",
        eventTitle: r.event_title || null,
        eventTime: r.event_time || null,
        eventLeague: r.event_league || null,
        propCloseTime: r.close_time || null,
        createdAt: r.created_at || null,
        updatedAt: r.updated_at || null,
        subjectLogoUrls: [],
        contentImageUrls: [],
        linkedPacks: r.pack_id ? [r.pack_id] : [],
        teams: [],
        propOrder: r.prop_order || 0,
        propSideAValue: r.prop_side_a_value ?? null,
        propSideBValue: r.prop_side_b_value ?? null,
      }));

      const nextOffset = rows.length === limit ? String(offset + limit) : null;
      return res.status(200).json({ success: true, props: propsData, nextOffset });
    } catch (err) {
      console.error("[api/props GET PG] error =>", err);
      return res.status(500).json({ success: false, error: "Failed to fetch props" });
    }
  }
  if (req.method === "PATCH") {
    // Postgres path
    if (getDataBackend() === 'postgres') {
      try {
        const {
          propId,
          propStatus,
          propOrder,
          propShort,
          propSummary,
          PropSideAShort,
          PropSideBShort,
          PropSideATake,
          PropSideBTake,
          propType,
          propCloseTime,
          PropSideAMoneyline,
          PropSideBMoneyline,
          gradingMode,
          formulaKey,
          formulaParams,
          propCover,
          propCoverSource,
          eventId,
        } = req.body || {};
        if (!propId) {
          return res.status(400).json({ success: false, error: "Missing propId" });
        }
        const fields = {};
        if (propStatus !== undefined) fields.prop_status = propStatus;
        if (propOrder  !== undefined) fields.prop_order  = propOrder;
        if (propShort  !== undefined) fields.prop_short  = propShort;
        if (propSummary!== undefined) fields.prop_summary= propSummary;
        if (PropSideAShort !== undefined) fields.prop_side_a_short = PropSideAShort;
        if (PropSideBShort !== undefined) fields.prop_side_b_short = PropSideBShort;
        if (PropSideATake  !== undefined) fields.prop_side_a_take  = PropSideATake;
        if (PropSideBTake  !== undefined) fields.prop_side_b_take  = PropSideBTake;
        if (propType       !== undefined) fields.prop_type         = propType;
        if (propCloseTime  !== undefined) fields.close_time        = propCloseTime ? new Date(propCloseTime).toISOString() : null;
        if (PropSideAMoneyline !== undefined && PropSideAMoneyline !== "") fields.moneyline_a = Number(PropSideAMoneyline);
        if (PropSideBMoneyline !== undefined && PropSideBMoneyline !== "") fields.moneyline_b = Number(PropSideBMoneyline);
        const makeValue = (n) => {
          if (!Number.isFinite(n) || n === 0) return null;
          const raw = n > 0 ? (n / 100) * 250 : (100 / Math.abs(n)) * 250;
          return Math.round(raw);
        };
        if (Object.prototype.hasOwnProperty.call(fields, 'moneyline_a')) {
          const n = Number(fields.moneyline_a);
          const val = makeValue(n);
          fields.prop_side_a_value = Number.isFinite(val) ? val : null;
        }
        if (Object.prototype.hasOwnProperty.call(fields, 'moneyline_b')) {
          const n = Number(fields.moneyline_b);
          const val = makeValue(n);
          fields.prop_side_b_value = Number.isFinite(val) ? val : null;
        }
        if (gradingMode   !== undefined) fields.grading_mode = gradingMode;
        if (formulaKey    !== undefined) fields.formula_key  = formulaKey;
        if (formulaParams !== undefined) {
          try {
            fields.formula_params = typeof formulaParams === 'string' ? JSON.parse(formulaParams) : formulaParams;
          } catch {
            fields.formula_params = { raw: String(formulaParams) };
          }
        }
        if (eventId !== undefined) {
          fields.event_id = eventId || null;
          // If unlinking the event, defensively disable auto-grading and clear formula
          if (eventId === null) {
            fields.grading_mode = 'manual';
            fields.formula_key = null;
            fields.formula_params = null;
          }
        }
        const normalizeSource = (s) => {
          const v = String(s || '').toLowerCase();
          if (v === 'hometeam') return 'homeTeam';
          if (v === 'awayteam') return 'awayTeam';
          if (v === 'custom') return 'custom';
          return v === 'event' ? 'event' : null;
        };
        async function resolveCoverUrlForEdit(src, existingId) {
          if (!src) return null;
          if (src === 'custom') return propCover || null;
          try {
            const { rows } = await query(
              `SELECT e.cover_url,
                      ht.logo_url AS home_logo,
                      at.logo_url AS away_logo
                 FROM props p
                 JOIN events e ON p.event_id = e.id
            LEFT JOIN teams ht ON e.home_team_id = ht.id
            LEFT JOIN teams at ON e.away_team_id = at.id
                WHERE p.id = $1
                LIMIT 1`,
              [existingId]
            );
            const r = rows?.[0];
            if (!r) return null;
            if (src === 'event') return r.cover_url || null;
            if (src === 'homeTeam') return r.home_logo || null;
            if (src === 'awayTeam') return r.away_logo || null;
            return null;
          } catch { return null; }
        }
        if (propCover !== undefined || propCoverSource !== undefined) {
          const src = normalizeSource(propCoverSource);
          let coverUrl = null;
          if (propCover && typeof propCover === 'string') {
            coverUrl = propCover;
          } else if (src) {
            coverUrl = await resolveCoverUrlForEdit(src, propId);
          }
          if (coverUrl !== null) fields.cover_url = coverUrl;
        }
        if (Object.keys(fields).length === 0) {
          return res.status(400).json({ success: false, error: "No fields provided to update" });
        }
        const { props } = createRepositories();
        const updated = await props.updateMany([{ id: propId, fields }]);
        return res.status(200).json({ success: true, record: updated?.[0] || null });
      } catch (err) {
        console.error("[api/props PATCH PG] Error =>", err);
        return res.status(500).json({ success: false, error: "Failed to update prop" });
      }
    }
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  // DELETE: remove a prop completely
  if (req.method === "DELETE") {
    if (getDataBackend() === 'postgres') {
      try {
        const { propId } = req.body || {};
        if (!propId) {
          return res.status(400).json({ success: false, error: "Missing propId" });
        }
        // Try to delete by primary UUID id first
        await query('DELETE FROM takes WHERE prop_id = $1', [propId]);
        const delById = await query('DELETE FROM props WHERE id = $1', [propId]);
        if (delById.rowCount && delById.rowCount > 0) {
          return res.status(200).json({ success: true, deleted: delById.rowCount });
        }
        // Fallback: by external text prop_id
        const { rows } = await query('SELECT id FROM props WHERE prop_id = $1 LIMIT 1', [propId]);
        if (!rows || rows.length === 0) {
          return res.status(404).json({ success: false, error: 'Prop not found' });
        }
        const internalId = rows[0].id;
        await query('DELETE FROM takes WHERE prop_id = $1', [internalId]);
        const delByText = await query('DELETE FROM props WHERE id = $1', [internalId]);
        return res.status(200).json({ success: true, deleted: delByText.rowCount || 0 });
      } catch (err) {
        console.error("[api/props DELETE PG] Error =>", err);
        return res.status(500).json({ success: false, error: "Failed to delete prop" });
      }
    }
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  // Fallback for unsupported methods
  return res.status(405).json({ success: false, error: "Method not allowed" });
}
