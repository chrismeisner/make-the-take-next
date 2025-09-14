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
  const { date, league, tz = 'America/New_York' } = req.query;
  if (!date) {
    return res.status(400).json({ success: false, error: 'Missing date parameter' });
  }
  console.log(`[api/admin/eventsByDate] Check events pressed for date=${date}, league=${league}`);
  try {
    const backend = getDataBackend();
    if (backend === 'postgres') {
      const dayStr = date;
      const params = [];
      let i = 1;
      let sql = `SELECT id,
                        title      AS "eventTitle",
                        event_time AS "eventTime",
                        league     AS "eventLeague"
                   FROM events
                  WHERE (timezone($${i++}, event_time))::date = $${i++}::date`;
      params.push(String(tz));
      params.push(dayStr);
      if (league) {
        sql += ` AND LOWER(COALESCE(league,'')) = $${i++}`;
        params.push(String(league).toLowerCase());
      }
      sql += ' ORDER BY event_time ASC';
      const { rows } = await query(sql, params);
      return res.status(200).json({ success: true, events: rows });
    }

    return res.status(400).json({ success: false, error: 'Unsupported in Postgres mode' });
  } catch (err) {
    console.error('[api/admin/eventsByDate] fetch error =>', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch events' });
  }
} 