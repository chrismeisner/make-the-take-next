import { getToken } from 'next-auth/jwt';
import { getDataBackend } from '../../../../../lib/runtimeConfig';
import { query } from '../../../../../lib/db/postgres';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  const { eventId } = req.query;
  if (!eventId) {
    return res.status(400).json({ success: false, error: 'Missing eventId parameter' });
  }
  try {
    const backend = getDataBackend();
    if (backend === 'postgres') {
      // Resolve internal UUID for event via flexible lookup
      const { rows: evRows } = await query(
        `SELECT id FROM events WHERE id::text = $1 OR event_id = $1 OR espn_game_id = $1 LIMIT 1`,
        [eventId]
      );
      if (!evRows || evRows.length === 0) {
        return res.status(200).json({ success: true, props: [] });
      }
      const internalEventId = evRows[0].id;
      const { rows } = await query(
        `SELECT id,
                COALESCE(prop_short, '')   AS "propShort",
                COALESCE(prop_summary, '') AS "propSummary",
                COALESCE(prop_status, '')  AS "propStatus",
                COALESCE(prop_order, 0)    AS "propOrder"
           FROM props
          WHERE event_id = $1
       ORDER BY prop_order ASC, id`,
        [internalEventId]
      );
      const props = rows.map((r) => ({
        airtableId: r.id,
        propShort: r.propShort,
        propSummary: r.propSummary,
        propStatus: r.propStatus,
        propOrder: r.propOrder,
      }));
      return res.status(200).json({ success: true, props });
    }

    return res.status(400).json({ success: false, error: 'Unsupported in Postgres mode' });
  } catch (err) {
    console.error('[api/admin/events/[eventId]/props] error =>', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch props' });
  }
}