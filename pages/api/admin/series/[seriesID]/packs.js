import { getToken } from 'next-auth/jwt';
import { query } from '../../../../../lib/db/postgres';

export default async function handler(req, res) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) return res.status(401).json({ success: false, error: 'Unauthorized' });

  const { seriesID } = req.query;

  if (req.method === 'GET') {
    try {
      const { rows } = await query(
        `SELECT p.id, p.pack_url, p.title, p.pack_status, p.created_at
           FROM series s
           JOIN series_packs sp ON sp.series_id = s.id
           JOIN packs p ON p.id = sp.pack_id
          WHERE s.series_id = $1 OR s.id::text = $1
          ORDER BY p.created_at DESC NULLS LAST`,
        [seriesID]
      );
      return res.status(200).json({ success: true, packs: rows });
    } catch (err) {
      console.error('[admin/series/packs][GET] error =>', err?.message || err);
      return res.status(500).json({ success: false, error: 'Failed to list series packs' });
    }
  }

  if (req.method === 'PUT') {
    try {
      const { packURLs = [] } = req.body || {};
      // Resolve series UUID
      const { rows: sRows } = await query(`SELECT id FROM series WHERE series_id = $1 OR id::text = $1 LIMIT 1`, [seriesID]);
      if (!sRows.length) return res.status(404).json({ success: false, error: 'Series not found' });
      const sid = sRows[0].id;

      // Resolve pack IDs
      const { rows: pRows } = await query(`SELECT id FROM packs WHERE pack_url = ANY($1::text[])`, [packURLs]);
      const packIds = pRows.map(r => r.id);

      // Replace membership
      await query('BEGIN');
      try {
        await query(`DELETE FROM series_packs WHERE series_id = $1`, [sid]);
        if (packIds.length > 0) {
          const values = packIds.map((_, i) => `($1, $${i + 2})`).join(',');
          await query(`INSERT INTO series_packs (series_id, pack_id) VALUES ${values} ON CONFLICT DO NOTHING`, [sid, ...packIds]);
        }
        await query('COMMIT');
      } catch (e) {
        await query('ROLLBACK').catch(() => {});
        throw e;
      }
      return res.status(200).json({ success: true, linked: packIds.length });
    } catch (err) {
      console.error('[admin/series/packs][PUT] error =>', err?.message || err);
      return res.status(500).json({ success: false, error: 'Failed to update series packs' });
    }
  }

  return res.status(405).json({ success: false, error: 'Method not allowed' });
}


