import { getToken } from 'next-auth/jwt';
import { query } from '../../../../lib/db/postgres';

function normalizeKey(val) {
  const s = String(val || '').trim().toLowerCase();
  return s.replace(/[^a-z0-9-_]/g, '-').replace(/-+/g, '-');
}

async function ensurePromoLinksTable() {
  // Create table, indexes, and trigger if missing
  await query(`
    CREATE TABLE IF NOT EXISTS promo_links (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      key TEXT UNIQUE,
      param_key TEXT,
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
  // Ensure param_key column exists and backfill default
  await query('ALTER TABLE promo_links ADD COLUMN IF NOT EXISTS param_key TEXT');
  await query("UPDATE promo_links SET param_key = 'packs' WHERE param_key IS NULL");
  await query('CREATE INDEX IF NOT EXISTS idx_promo_links_active ON promo_links (active)');
  await query('CREATE INDEX IF NOT EXISTS idx_promo_links_key ON promo_links (key)');
  await query('CREATE INDEX IF NOT EXISTS idx_promo_links_priority ON promo_links (priority DESC)');
  await query('CREATE INDEX IF NOT EXISTS idx_promo_links_param_key ON promo_links (param_key)');
  await query(`
    CREATE OR REPLACE FUNCTION set_promo_links_updated_at() RETURNS trigger AS $fn$
    BEGIN
      NEW.updated_at := NOW();
      RETURN NEW;
    END;
    $fn$ LANGUAGE plpgsql;
  `);
  await query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'set_promo_links_updated_at'
      ) THEN
        CREATE TRIGGER set_promo_links_updated_at
        BEFORE UPDATE ON promo_links
        FOR EACH ROW
        EXECUTE FUNCTION set_promo_links_updated_at();
      END IF;
    END $$;
  `);
}

export default async function handler(req, res) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token || !token.superAdmin) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  if (req.method === 'GET') {
    try {
      await ensurePromoLinksTable();
      const { rows } = await query(
        `SELECT id, key, param_key, destination_url, notes, active, priority, clicks, created_at, updated_at, expires_at
           FROM promo_links
          ORDER BY active DESC, priority DESC, updated_at DESC`
      );
      return res.status(200).json({ success: true, records: rows });
    } catch (e) {
      return res.status(500).json({ success: false, error: e?.message || 'Failed to list promo links' });
    }
  }

  if (req.method === 'POST') {
    const { key, param_key, destination_url, notes, active, priority, expires_at } = req.body || {};
    const finalKey = normalizeKey(key);
    if (!finalKey || !destination_url) {
      return res.status(400).json({ success: false, error: 'Missing required fields: key, destination_url' });
    }
    const allowedParams = ['packs','team','promo'];
    const finalParamKey = allowedParams.includes(String(param_key || '').toLowerCase())
      ? String(param_key).toLowerCase()
      : 'packs';
    try {
      await ensurePromoLinksTable();
      const { rows } = await query(
        `INSERT INTO promo_links (key, param_key, destination_url, notes, active, priority, expires_at)
         VALUES ($1, $2, $3, $4, COALESCE($5, TRUE), COALESCE($6, 0), $7)
         ON CONFLICT (key) DO UPDATE SET
           destination_url = EXCLUDED.destination_url,
           param_key = EXCLUDED.param_key,
           notes = EXCLUDED.notes,
           active = EXCLUDED.active,
           priority = EXCLUDED.priority,
           expires_at = EXCLUDED.expires_at,
           updated_at = NOW()
         RETURNING id, key, param_key, destination_url, notes, active, priority, clicks, created_at, updated_at, expires_at`,
        [finalKey, finalParamKey, destination_url, notes || null, active === undefined ? true : Boolean(active), Number.isFinite(Number(priority)) ? Number(priority) : 0, expires_at || null]
      );
      return res.status(200).json({ success: true, record: rows[0] });
    } catch (e) {
      return res.status(500).json({ success: false, error: e?.message || 'Failed to upsert promo link' });
    }
  }

  return res.status(405).json({ success: false, error: 'Method not allowed' });
}


