import { getToken } from 'next-auth/jwt';
import { query } from '../../../../lib/db/postgres';

export default async function handler(req, res) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) return res.status(401).json({ success: false, error: 'Unauthorized' });

  const { seriesID } = req.query;

  if (req.method === 'GET') {
    try {
      const { rows } = await query(
        `SELECT id, series_id, title, summary, cover_url, status, created_at
           FROM series
          WHERE series_id = $1 OR id::text = $1
          LIMIT 1`,
        [seriesID]
      );
      if (!rows.length) return res.status(404).json({ success: false, error: 'Series not found' });
      return res.status(200).json({ success: true, record: rows[0] });
    } catch (err) {
      console.error('[admin/series/id][GET] error =>', err?.message || err);
      return res.status(500).json({ success: false, error: 'Failed to load series' });
    }
  }

  if (req.method === 'PUT') {
    try {
      const { title, summary, coverUrl, status } = req.body || {};
      const { rows } = await query(
        `UPDATE series
            SET title = COALESCE($2, title),
                summary = COALESCE($3, summary),
                cover_url = COALESCE($4, cover_url),
                status = COALESCE($5, status)
          WHERE series_id = $1 OR id::text = $1
          RETURNING id, series_id`,
        [seriesID, title || null, summary || null, coverUrl || null, status || null]
      );
      if (!rows.length) return res.status(404).json({ success: false, error: 'Series not found' });
      return res.status(200).json({ success: true, record: rows[0] });
    } catch (err) {
      console.error('[admin/series/id][PUT] error =>', err?.message || err);
      return res.status(500).json({ success: false, error: 'Failed to update series' });
    }
  }

  if (req.method === 'DELETE') {
    try {
      const { rowCount } = await query(
        `DELETE FROM series WHERE series_id = $1 OR id::text = $1`,
        [seriesID]
      );
      if (rowCount === 0) return res.status(404).json({ success: false, error: 'Series not found' });
      return res.status(200).json({ success: true });
    } catch (err) {
      console.error('[admin/series/id][DELETE] error =>', err?.message || err);
      return res.status(500).json({ success: false, error: 'Failed to delete series' });
    }
  }

  return res.status(405).json({ success: false, error: 'Method not allowed' });
}


