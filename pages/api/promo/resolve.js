import { query } from '../../../lib/db/postgres';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
  try {
    const raw = String(req.query.key || req.query.packs || '').trim();
    const key = raw.toLowerCase();
    if (!key) {
      return res.status(400).json({ success: false, error: 'Missing key' });
    }
    const { rows } = await query(
      `SELECT id, key, destination_url, active, priority, clicks, expires_at
         FROM promo_links
        WHERE key = $1
          AND active = TRUE
          AND (expires_at IS NULL OR NOW() < expires_at)
        ORDER BY priority DESC
        LIMIT 1`,
      [key]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Not found' });
    }
    const rec = rows[0];
    // Increment clicks asynchronously (fire-and-forget)
    query('UPDATE promo_links SET clicks = clicks + 1, updated_at = NOW() WHERE id = $1', [rec.id]).catch(() => {});
    return res.status(200).json({ success: true, destination: rec.destination_url });
  } catch (e) {
    return res.status(500).json({ success: false, error: e?.message || 'Failed to resolve promo link' });
  }
}


