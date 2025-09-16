import { getToken } from 'next-auth/jwt';
import { getDataBackend } from '../../../lib/runtimeConfig';
import { query } from '../../../lib/db/postgres';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  try {
    const backend = getDataBackend();
    if (backend === 'postgres') {
      // Try to include cover_url if present; fall back safely if not
      let rows;
      try {
        ({ rows } = await query(
          `SELECT e.id,
                  e.title       AS "eventTitle",
                  e.event_time  AS "eventTime",
                  e.league      AS "eventLeague",
                  e.city        AS "city",
                  e.state       AS "state",
                  e.venue       AS "venue",
                  e.tv          AS "tv",
                  e.week        AS "week",
                  e.cover_url   AS "eventCoverURL",
                  COALESCE(COUNT(p.id), 0) AS "propCount"
             FROM events e
        LEFT JOIN props p ON p.event_id = e.id
         GROUP BY e.id, e.title, e.event_time, e.league, e.city, e.state, e.venue, e.tv, e.week, e.cover_url
         ORDER BY e.event_time ASC`
        ));
      } catch (e) {
        ({ rows } = await query(
          `SELECT e.id,
                  e.title       AS "eventTitle",
                  e.event_time  AS "eventTime",
                  e.league      AS "eventLeague",
                  e.city        AS "city",
                  e.state       AS "state",
                  e.venue       AS "venue",
                  e.tv          AS "tv",
                  e.week        AS "week",
                  NULL::text    AS "eventCoverURL",
                  COALESCE(COUNT(p.id), 0) AS "propCount"
             FROM events e
        LEFT JOIN props p ON p.event_id = e.id
         GROUP BY e.id, e.title, e.event_time, e.league, e.city, e.state, e.venue, e.tv, e.week
         ORDER BY e.event_time ASC`
        ));
      }
      return res.status(200).json({ success: true, events: rows });
    } else {
      return res.status(400).json({ success: false, error: 'Unsupported in Postgres mode' });
    }
  } catch (err) {
    console.error('[api/admin/events] fetch error =>', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch events' });
  }
}