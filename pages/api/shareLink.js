import { query } from '../../lib/db/postgres';
import { randomUUID } from 'crypto';

async function ensureTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS share_links (
      share_id TEXT PRIMARY KEY,
      pack_url TEXT NOT NULL,
      profile_id TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_share_links_unique ON share_links (pack_url, profile_id);
  `);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
  try {
    const { packURL, profileID } = req.body || {};
    if (!packURL || !profileID) {
      return res.status(400).json({ success: false, error: 'Missing packURL or profileID' });
    }
    await ensureTable();
    // Try to find existing
    const { rows: existing } = await query('SELECT share_id FROM share_links WHERE pack_url = $1 AND profile_id = $2 LIMIT 1', [packURL, profileID]);
    if (existing && existing.length > 0) {
      return res.status(200).json({ success: true, shareId: existing[0].share_id });
    }
    // Create new mapping
    const shareId = randomUUID();
    await query('INSERT INTO share_links (share_id, pack_url, profile_id) VALUES ($1, $2, $3)', [shareId, packURL, profileID]);
    return res.status(200).json({ success: true, shareId });
  } catch (err) {
    console.error('[api/shareLink] error =>', err);
    return res.status(500).json({ success: false, error: 'Failed to create share link' });
  }
}


