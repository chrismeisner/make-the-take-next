import { query } from '../../../lib/db/postgres';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
  const { eventTitle, eventTime, eventLeague } = req.body;
  if (!eventTitle || !eventTime || !eventLeague) {
    return res.status(400).json({ success: false, error: 'Missing required fields' });
  }
  try {
    const { rows } = await query(
      `INSERT INTO events (title, event_time, league)
         VALUES ($1, $2, $3)
         RETURNING id, title, event_time, league`,
      [eventTitle, eventTime, eventLeague]
    );
    const record = rows[0] || null;
    return res.status(200).json({ success: true, record });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[api/admin/createEvent] Postgres create error =>', error);
    return res.status(500).json({ success: false, error: 'Failed to create event' });
  }
} 