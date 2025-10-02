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
        [String(eventId)]
      );
      if (!evRows || evRows.length === 0) {
        return res.status(200).json({ success: true, packs: [] });
      }
      const internalEventId = evRows[0].id;

      // Fetch packs linked directly via packs.event_id or via packs_events join
      const { rows } = await query(
        `WITH direct AS (
           SELECT p.id, p.pack_id, p.pack_url, p.title, p.cover_url, p.league, p.pack_status,
                  p.pack_open_time, p.pack_close_time, p.created_at
             FROM packs p
            WHERE p.event_id = $1
         ),
         via_join AS (
           SELECT p.id, p.pack_id, p.pack_url, p.title, p.cover_url, p.league, p.pack_status,
                  p.pack_open_time, p.pack_close_time, p.created_at
             FROM packs p
             JOIN packs_events pe ON pe.pack_id = p.id
            WHERE pe.event_id = $1
         ),
         unioned AS (
           SELECT * FROM direct
           UNION
           SELECT * FROM via_join
         ),
         props_count AS (
           SELECT pr.pack_id, COUNT(*)::int AS cnt
             FROM props pr
            WHERE pr.pack_id IN (SELECT id FROM unioned)
            GROUP BY pr.pack_id
         )
         SELECT u.*, COALESCE(pc.cnt, 0) AS props_count
           FROM unioned u
           LEFT JOIN props_count pc ON pc.pack_id = u.id
          ORDER BY u.created_at DESC NULLS LAST, u.title ASC`,
        [internalEventId]
      );
      const packs = rows.map((r) => ({
        id: r.id,
        packId: r.pack_id || r.id,
        packURL: r.pack_url || '',
        title: r.title || 'Untitled',
        coverUrl: r.cover_url || null,
        league: r.league || null,
        packStatus: r.pack_status || null,
        packOpenTime: r.pack_open_time || null,
        packCloseTime: r.pack_close_time || null,
        createdAt: r.created_at || null,
        propsCount: r.props_count || 0,
      }));
      return res.status(200).json({ success: true, packs });
    }
    return res.status(400).json({ success: false, error: 'Unsupported in Postgres mode' });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[api/admin/events/[eventId]/packs] error =>', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch packs for event' });
  }
}


