import { getToken } from 'next-auth/jwt';
import { getDataBackend } from '../../../../../lib/runtimeConfig';
import { query } from '../../../../../lib/db/postgres';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  const { eventId } = req.query;
  const { sourceEventId, title, league, eventTime } = req.body || {};
  if (!eventId || !sourceEventId) {
    return res.status(400).json({ success: false, error: 'Missing required parameters' });
  }

  try {
    const backend = getDataBackend();
    if (backend !== 'postgres') {
      return res.status(400).json({ success: false, error: 'Unsupported in Postgres mode' });
    }

    // Update espn_game_id and optionally title/league/event_time
    const sets = ['espn_game_id = $1'];
    const params = [String(sourceEventId)];
    let i = 2;
    if (title !== undefined) { sets.push(`title = $${i++}`); params.push(title); }
    if (league !== undefined) { sets.push(`league = $${i++}`); params.push(league); }
    if (eventTime !== undefined) { sets.push(`event_time = $${i++}`); params.push(eventTime ? new Date(eventTime).toISOString() : null); }
    params.push(eventId);

    await query(`UPDATE events SET ${sets.join(', ')} WHERE id::text = $${i}`, params);

    // Return updated row minimal
    const { rows } = await query(
      `SELECT id,
              title      AS "eventTitle",
              event_time AS "eventTime",
              league     AS "eventLeague",
              espn_game_id AS "espnGameID"
         FROM events
        WHERE id::text = $1
        LIMIT 1`,
      [eventId]
    );
    if (!rows || rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Event not found after relink' });
    }
    return res.status(200).json({ success: true, event: rows[0] });
  } catch (e) {
    console.error('[api/admin/events/[eventId]/relink] Error =>', e);
    return res.status(500).json({ success: false, error: 'Failed to relink event' });
  }
}


