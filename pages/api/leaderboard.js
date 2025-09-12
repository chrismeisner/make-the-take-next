// File: pages/api/leaderboard.js
import { query } from '../../lib/db/postgres';

export default async function handler(req, res) {
  const { subjectID, packURL, limit: limitParam } = req.query;

  try {
    const limit = Math.min(Number.parseInt(limitParam || '100', 10), 500);
    const { rows } = await query(
      `WITH filtered_takes AS (
         SELECT t.take_mobile,
                t.take_result,
                COALESCE(t.take_pts, 0) AS take_pts
           FROM takes t
          WHERE t.take_status = 'latest'
            AND (
              ($1::text IS NULL AND $2::text IS NULL)
              OR EXISTS (
                    SELECT 1
                      FROM props p
                      JOIN packs k ON p.pack_id = k.id
                     WHERE p.prop_id = t.prop_id_text
                       AND ($1::text IS NULL OR k.pack_url = $1)
                       AND ($2::text IS NULL OR p.prop_summary ILIKE '%' || $2 || '%')
              )
            )
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
        LIMIT $3`,
      [packURL || null, subjectID || null, limit]
    );

    const leaderboard = rows.map((r) => ({
      phone: r.take_mobile,
      takes: Number(r.takes) || 0,
      points: Number(r.points) || 0,
      profileID: r.profile_id || null,
      won: Number(r.won) || 0,
      lost: Number(r.lost) || 0,
      pushed: Number(r.pushed) || 0,
    }));
    return res.status(200).json({ success: true, leaderboard });
  } catch (err) {
    const meta = { name: err?.name, message: err?.message, code: err?.code, stack: err?.stack };
    try { console.error('[API /leaderboard] Error:', meta); } catch {}
    res.status(500).json({ success: false, error: 'Failed to fetch leaderboard', meta });
  }
}
