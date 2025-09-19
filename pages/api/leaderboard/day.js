// File: pages/api/leaderboard/day.js
import { query } from '../../../lib/db/postgres';

export default async function handler(req, res) {
  const { day, limit: limitParam, packIds: packIdsParam } = req.query;

  try {
    const limit = Math.min(Number.parseInt(limitParam || '100', 10), 500);
    
    // Calculate date range based on day parameter
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    let startDate, endDate, dayLabel;
    
    switch (day) {
      case 'today':
        startDate = new Date(today);
        endDate = new Date(today);
        endDate.setDate(endDate.getDate() + 1);
        dayLabel = "Today's";
        break;
      case 'yesterday':
        startDate = new Date(today);
        startDate.setDate(startDate.getDate() - 1);
        endDate = new Date(today);
        dayLabel = "Yesterday's";
        break;
      case 'tomorrow':
        startDate = new Date(today);
        startDate.setDate(startDate.getDate() + 1);
        endDate = new Date(today);
        endDate.setDate(endDate.getDate() + 2);
        dayLabel = "Tomorrow's";
        break;
      case 'thisWeek':
        startDate = new Date(today);
        startDate.setDate(startDate.getDate() + 2);
        endDate = new Date(today);
        endDate.setDate(endDate.getDate() + 8);
        dayLabel = "This Week's";
        break;
      case 'nextWeek':
        startDate = new Date(today);
        startDate.setDate(startDate.getDate() + 8);
        endDate = new Date(today);
        endDate.setDate(endDate.getDate() + 15);
        dayLabel = "Next Week's";
        break;
      default:
        // Default to today
        startDate = new Date(today);
        endDate = new Date(today);
        endDate.setDate(endDate.getDate() + 1);
        dayLabel = "Today's";
    }

    // Optional pack ID filter coming from client to scope strictly to visible packs
    const packIds = String(packIdsParam || '')
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    const usePackFilter = packIds.length > 0;

    try {
      // eslint-disable-next-line no-console
      console.log('[day leaderboard] inputs =>', {
        day,
        startDate: startDate?.toISOString?.() || null,
        endDate: endDate?.toISOString?.() || null,
        usePackFilter,
        packIdsCount: packIds.length,
        limit
      });
    } catch {}

    const { rows } = await query(
      `WITH pack_events AS (
         SELECT p.id AS pack_id,
                e.event_time
           FROM packs p
           JOIN events e ON e.id = p.event_id
         UNION ALL
         SELECT pe.pack_id,
                e.event_time
           FROM packs_events pe
           JOIN events e ON e.id = pe.event_id
       ),
       day_packs AS (
         SELECT DISTINCT p.id,
                p.pack_id,
                p.pack_url,
                p.title,
                p.pack_status
           FROM packs p
           JOIN pack_events ev ON ev.pack_id = p.id
          WHERE (ev.event_time::date >= $1::date AND ev.event_time::date < $2::date)
           AND (
             $4::boolean = FALSE
             OR p.id::text = ANY($5::text[])
             OR p.pack_id::text = ANY($5::text[])
           )
            AND p.pack_status IN ('active','open','coming-soon','draft','live','closed','pending-grade','graded')
       ),
       day_props AS (
         SELECT pr.id,
                pr.prop_id,
                pr.pack_id
           FROM props pr
           JOIN day_packs dp ON dp.id = pr.pack_id
       ),
       filtered_takes AS (
         SELECT t.take_mobile,
                t.take_result,
                COALESCE(t.take_pts, 0) AS take_pts
           FROM takes t
           JOIN day_props dp ON dp.prop_id = t.prop_id_text
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
        LIMIT $3`,
      [startDate, endDate, limit, usePackFilter, usePackFilter ? packIds : []]
    );

    const leaderboard = rows.map((r) => ({
      phone: r.take_mobile,
      profileID: r.profile_id,
      count: r.takes,
      points: r.points,
      won: r.won,
      lost: r.lost,
      pushed: r.pushed,
    }));

    try {
      // eslint-disable-next-line no-console
      console.log('[day leaderboard] results =>', { count: leaderboard.length });
    } catch {}

    return res.status(200).json({ 
      success: true, 
      leaderboard,
      dayLabel,
      day,
      packCount: 0 // We could add this if needed
    });
  } catch (err) {
    console.error('[day leaderboard] Error =>', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
