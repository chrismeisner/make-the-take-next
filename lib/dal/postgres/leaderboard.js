import { query } from '../../db/postgres';

/**
 * getLeaderboard
 * Centralized leaderboard aggregation against v_take_facts.
 * Options:
 *  - teamSlug?: string (resolved to team_id)
 *  - packIds?: string[] (accepts UUIDs or text pack_id)
 *  - startDate?: string | Date (inclusive, ISO ok)
 *  - endDate?: string | Date (exclusive, ISO ok)
 *  - limit?: number
 */
export async function getLeaderboard(options = {}) {
  const {
    teamSlug = '',
    packIds = [],
    startDate = null,
    endDate = null,
    limit: limitParam = 100,
  } = options;

  const limit = Math.min(Number.parseInt(String(limitParam || 100), 10) || 100, 500);

  // Resolve teamSlug -> team_id
  let teamId = null;
  if (teamSlug) {
    const { rows: trows } = await query(
      `SELECT id FROM teams WHERE LOWER(team_slug) = LOWER($1) LIMIT 1`,
      [teamSlug]
    );
    if (trows.length) teamId = trows[0].id;
  }

  const useTeam = Boolean(teamId);
  const packIdList = Array.isArray(packIds) ? packIds.map((s) => String(s).trim()).filter(Boolean) : [];
  const usePacks = packIdList.length > 0;
  const useStart = Boolean(startDate);
  const useEnd = Boolean(endDate);

  // Accept both internal UUID and external text pack_id by joining packs
  let rows;
  try {
    const result = await query(
      `WITH v AS (
         SELECT vtf.take_mobile,
                vtf.take_result,
                vtf.take_pts,
                vtf.profile_id,
                vtf.pack_id,
                vtf.event_time
           FROM v_take_facts vtf
           JOIN packs pk ON pk.id = vtf.pack_id
          WHERE ($1::boolean = FALSE OR vtf.team_id::text = $2::text)
            AND ($3::boolean = FALSE OR (
                 pk.id::text = ANY($4::text[])
                 OR pk.pack_id::text = ANY($4::text[])
            ))
            AND ($5::boolean = FALSE OR vtf.event_time >= $6::timestamptz)
            AND ($7::boolean = FALSE OR vtf.event_time <  $8::timestamptz)
        )
        , agg AS (
          SELECT take_mobile,
                 COUNT(*)::int AS takes,
                 SUM(CASE WHEN take_result = 'won'  THEN 1 ELSE 0 END)::int AS won,
                 SUM(CASE WHEN take_result = 'lost' THEN 1 ELSE 0 END)::int AS lost,
                 SUM(CASE WHEN take_result = 'push' THEN 1 ELSE 0 END)::int AS pushed,
                 SUM(COALESCE(take_pts,0))::int AS points
            FROM v
           GROUP BY take_mobile
        )
        SELECT a.take_mobile,
               a.takes,
               a.won,
               a.lost,
               a.pushed,
               a.points,
               pr.profile_id
          FROM agg a
          LEFT JOIN profiles pr ON pr.mobile_e164 = a.take_mobile
         ORDER BY a.points DESC, a.takes DESC
         LIMIT $9`,
      [
        useTeam,
        teamId ? String(teamId) : null,
        usePacks,
        usePacks ? packIdList : [],
        useStart,
        useStart ? new Date(startDate) : null,
        useEnd,
        useEnd ? new Date(endDate) : null,
        limit,
      ]
    );
    rows = result.rows;
  } catch (err) {
    // Fallback if view is missing (error code 42P01: undefined_table)
    const code = err && (err.code || err.sqlState || '');
    const msg = (err && err.message) || '';
    const isMissingView = code === '42P01' || /v_take_facts/i.test(msg);
    if (!isMissingView) throw err;

    const fallback = await query(
      `WITH pack_events AS (
         SELECT p.id AS pack_id,
                e.event_time
           FROM packs p
           LEFT JOIN events e ON e.id = p.event_id
         UNION ALL
         SELECT pe.pack_id,
                e.event_time
           FROM packs_events pe
           JOIN events e ON e.id = pe.event_id
       ),
       eligible_packs AS (
         SELECT pk.id AS pack_id
           FROM packs pk
           LEFT JOIN pack_events ev ON ev.pack_id = pk.id
          WHERE ($3::boolean = FALSE OR (
                   pk.id::text = ANY($4::text[]) OR pk.pack_id::text = ANY($4::text[])
                ))
            AND ($5::boolean = FALSE OR ev.event_time >= $6::timestamptz)
            AND ($7::boolean = FALSE OR ev.event_time <  $8::timestamptz)
       ),
       filtered_props AS (
         SELECT pr.id, pr.prop_id
           FROM props pr
           JOIN eligible_packs ep ON ep.pack_id = pr.pack_id
          WHERE ($1::boolean = FALSE OR EXISTS (
                   SELECT 1 FROM props_teams pt WHERE pt.prop_id = pr.id AND pt.team_id::text = $2::text
                ))
       ),
       filtered_takes AS (
         SELECT t.take_mobile,
                t.take_result,
                COALESCE(t.take_pts, 0) AS take_pts
           FROM takes t
           JOIN filtered_props fp ON (fp.id = t.prop_id OR fp.prop_id = t.prop_id_text)
          WHERE t.take_status = 'latest'
       ),
       agg AS (
         SELECT take_mobile,
                COUNT(*)::int AS takes,
                SUM(CASE WHEN take_result = 'won'  THEN 1 ELSE 0 END)::int AS won,
                SUM(CASE WHEN take_result = 'lost' THEN 1 ELSE 0 END)::int AS lost,
                SUM(CASE WHEN take_result = 'push' THEN 1 ELSE 0 END)::int AS pushed,
                SUM(take_pts)::int AS points
           FROM filtered_takes
          GROUP BY take_mobile
       )
       SELECT a.take_mobile,
              a.takes,
              a.won,
              a.lost,
              a.pushed,
              a.points,
              pr.profile_id
         FROM agg a
         LEFT JOIN profiles pr ON pr.mobile_e164 = a.take_mobile
        ORDER BY a.points DESC, a.takes DESC
        LIMIT $9`,
      [
        useTeam,
        teamId ? String(teamId) : null,
        usePacks,
        usePacks ? packIdList : [],
        useStart,
        useStart ? new Date(startDate) : null,
        useEnd,
        useEnd ? new Date(endDate) : null,
        limit,
      ]
    );
    rows = fallback.rows;
  }

  return rows.map((r) => ({
    phone: r.take_mobile,
    profileID: r.profile_id || null,
    takes: Number(r.takes || 0),
    points: Number(r.points || 0),
    won: Number(r.won || 0),
    lost: Number(r.lost || 0),
    pushed: Number(r.pushed || 0),
  }));
}

export default { getLeaderboard };


