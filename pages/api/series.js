import { query } from "../../lib/db/postgres";

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
  try {
    const { rows } = await query(
      `SELECT id::text AS id, series_id, title, status, created_at
         FROM series
        ORDER BY created_at DESC NULLS LAST`);
    const series = Array.isArray(rows) ? rows.map(r => ({
      id: r.id,
      seriesId: r.series_id,
      title: r.title || r.series_id || 'Untitled Series',
      status: r.status || null,
    })) : [];
    return res.status(200).json({ success: true, series });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[api/series] error', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}


