import { getToken } from 'next-auth/jwt';
import { query } from '../../../../lib/db/postgres';

export default async function handler(req, res) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) return res.status(401).json({ success: false, error: 'Unauthorized' });

  if (req.method === 'GET') {
    try {
      const { rows } = await query(
        `SELECT id, series_id, title, summary, cover_url, status, created_at
           FROM series
          ORDER BY created_at DESC
          LIMIT 200`
      );
      return res.status(200).json({ success: true, series: rows });
    } catch (err) {
      console.error('[admin/series][GET] error =>', err?.message || err);
      return res.status(500).json({ success: false, error: 'Failed to list series' });
    }
  }

  if (req.method === 'POST') {
    try {
      const { seriesID, title, summary, coverUrl, status } = req.body || {};
      const { rows } = await query(
        `INSERT INTO series (series_id, title, summary, cover_url, status)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (series_id) DO UPDATE SET
           title = COALESCE(EXCLUDED.title, series.title),
           summary = COALESCE(EXCLUDED.summary, series.summary),
           cover_url = COALESCE(EXCLUDED.cover_url, series.cover_url),
           status = COALESCE(EXCLUDED.status, series.status)
         RETURNING id, series_id`,
        [seriesID || null, title || null, summary || null, coverUrl || null, status || null]
      );
      return res.status(200).json({ success: true, record: rows[0] });
    } catch (err) {
      console.error('[admin/series][POST] error =>', err?.message || err);
      return res.status(500).json({ success: false, error: 'Failed to create series' });
    }
  }

  return res.status(405).json({ success: false, error: 'Method not allowed' });
}


