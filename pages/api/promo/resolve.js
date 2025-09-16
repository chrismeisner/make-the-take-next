import { query } from '../../../lib/db/postgres';

async function ensurePromoLinksTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS promo_links (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      key TEXT UNIQUE,
      destination_url TEXT NOT NULL,
      notes TEXT,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      priority INT NOT NULL DEFAULT 0,
      clicks INT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ
    );
  `);
  await query(`
    CREATE OR REPLACE FUNCTION set_promo_links_updated_at() RETURNS trigger AS $fn$
    BEGIN
      NEW.updated_at := NOW();
      RETURN NEW;
    END;
    $fn$ LANGUAGE plpgsql;
  `);
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
  try {
    await ensurePromoLinksTable();
    const raw = String(req.query.key || '').trim();
    const key = raw.toLowerCase();
    const param = String(req.query.param || '').trim().toLowerCase();
    if (!key) {
      return res.status(400).json({ success: false, error: 'Missing key' });
    }
    const args = [key];
    let sql = `SELECT id, key, param_key, destination_url, active, priority, clicks, expires_at
                 FROM promo_links
                WHERE key = $1
                  AND active = TRUE
                  AND (expires_at IS NULL OR NOW() < expires_at)`;
    if (param) {
      sql += ` AND (param_key = $2)`;
      args.push(param);
    }
    sql += ` ORDER BY priority DESC LIMIT 1`;
    const { rows } = await query(sql, args);
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


