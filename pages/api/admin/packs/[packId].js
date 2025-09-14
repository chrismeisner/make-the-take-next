import { getToken } from 'next-auth/jwt';
import { query } from '../../../../lib/db/postgres';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  const { packId } = req.query;
  if (!packId) {
    return res.status(400).json({ success: false, error: 'Missing packId parameter' });
  }
  try {
    const { rows } = await query(
      `SELECT p.id,
              p.pack_id,
              p.pack_url,
              p.title,
              p.summary,
              p.prize,
              p.cover_url,
              p.league,
              p.pack_status,
              p.pack_open_time,
              p.pack_close_time,
              p.created_at,
              e.title AS event_title,
              e.event_time AS event_time,
              (SELECT COUNT(*)::int FROM props pr WHERE pr.pack_id = p.id) AS props_count
         FROM packs p
    LEFT JOIN events e ON e.id = p.event_id
        WHERE p.id::text = $1 OR p.pack_id = $1 OR p.pack_url = $1
        LIMIT 1`,
      [String(packId)]
    );
    if (!rows || rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Pack not found' });
    }
    const r = rows[0];

    // Resolve linked event IDs from join table (packs_events); fallback to packs.event_id
    let packEventIds = [];
    try {
      const { rows: evJoin } = await query(
        `SELECT pe.event_id FROM packs_events pe WHERE pe.pack_id = $1`,
        [r.id]
      );
      packEventIds = Array.from(new Set((evJoin || []).map((row) => row.event_id).filter(Boolean)));
      if (packEventIds.length === 0) {
        const { rows: evSingle } = await query(`SELECT event_id FROM packs WHERE id = $1`, [r.id]);
        const eid = evSingle?.[0]?.event_id || null;
        if (eid) packEventIds = [eid];
      }
    } catch {}
    const toIso = (t) => (t ? new Date(t).toISOString() : null);
    const pack = {
      airtableId: r.id,
      packID: r.pack_id || r.id,
      packTitle: r.title || 'Untitled Pack',
      packSummary: r.summary || '',
      packURL: r.pack_url || '',
      packPrize: r.prize || '',
      packCover: r.cover_url || null,
      packLeague: r.league || null,
      packStatus: r.pack_status || '',
      packOpenTime: toIso(r.pack_open_time) || null,
      packCloseTime: toIso(r.pack_close_time) || null,
      createdAt: toIso(r.created_at) || null,
      eventTitle: r.event_title || null,
      eventTime: toIso(r.event_time) || null,
      propsCount: Number(r.props_count || 0),
      packEventId: packEventIds.length > 0 ? packEventIds[0] : null,
      packEventIds,
    };
    return res.status(200).json({ success: true, pack });
  } catch (e) {
    console.error('[api/admin/packs/[packId]] error =>', e?.message || e);
    return res.status(500).json({ success: false, error: 'Failed to fetch pack' });
  }
}


