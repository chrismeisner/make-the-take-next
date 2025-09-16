import { getToken } from 'next-auth/jwt';
import { query } from '../../../../lib/db/postgres';

function normalizeKey(val) {
  const s = String(val || '').trim().toLowerCase();
  return s.replace(/[^a-z0-9-_]/g, '-').replace(/-+/g, '-');
}

export default async function handler(req, res) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token || !token.superAdmin) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  if (req.method === 'GET') {
    try {
      const { rows } = await query(
        `SELECT id, key, destination_url, notes, active, priority, clicks, created_at, updated_at, expires_at
           FROM promo_links
          ORDER BY active DESC, priority DESC, updated_at DESC`
      );
      return res.status(200).json({ success: true, records: rows });
    } catch (e) {
      return res.status(500).json({ success: false, error: e?.message || 'Failed to list promo links' });
    }
  }

  if (req.method === 'POST') {
    const { key, destination_url, notes, active, priority, expires_at } = req.body || {};
    const finalKey = normalizeKey(key);
    if (!finalKey || !destination_url) {
      return res.status(400).json({ success: false, error: 'Missing required fields: key, destination_url' });
    }
    try {
      const { rows } = await query(
        `INSERT INTO promo_links (key, destination_url, notes, active, priority, expires_at)
         VALUES ($1, $2, $3, COALESCE($4, TRUE), COALESCE($5, 0), $6)
         ON CONFLICT (key) DO UPDATE SET
           destination_url = EXCLUDED.destination_url,
           notes = EXCLUDED.notes,
           active = EXCLUDED.active,
           priority = EXCLUDED.priority,
           expires_at = EXCLUDED.expires_at,
           updated_at = NOW()
         RETURNING id, key, destination_url, notes, active, priority, clicks, created_at, updated_at, expires_at`,
        [finalKey, destination_url, notes || null, active === undefined ? true : Boolean(active), Number.isFinite(Number(priority)) ? Number(priority) : 0, expires_at || null]
      );
      return res.status(200).json({ success: true, record: rows[0] });
    } catch (e) {
      return res.status(500).json({ success: false, error: e?.message || 'Failed to upsert promo link' });
    }
  }

  return res.status(405).json({ success: false, error: 'Method not allowed' });
}


