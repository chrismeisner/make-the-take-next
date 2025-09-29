// pages/api/h2h/challenge/create.js
import crypto from 'crypto';
import { getCurrentUser } from '../../../../lib/auth';
import { query } from '../../../../lib/db/postgres';
import { PostgresH2HRepository } from '../../../../lib/dal/postgres/h2h';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });

  const user = await getCurrentUser(req);
  if (!user || !user.userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

  try {
    const { packId } = req.body || {};
    if (!packId) return res.status(400).json({ success: false, error: 'Missing packId' });

    // Resolve pack by text pack_id or UUID
    let packRow = null;
    {
      const dalCheck = await query(`SELECT id, pack_id FROM packs WHERE pack_id = $1 LIMIT 1`, [packId]);
      packRow = dalCheck.rows[0] || null;
    }
    if (!packRow) {
      const dalCheck2 = await query(`SELECT id, pack_id FROM packs WHERE id = $1::uuid LIMIT 1`, [packId]).catch(() => ({ rows: [] }));
      packRow = dalCheck2.rows[0] || null;
    }
    if (!packRow) return res.status(404).json({ success: false, error: 'Pack not found' });

    // Prevent duplicate active challenges between same pair
    const { rows: existing } = await query(
      `SELECT 1 FROM h2h_matchups WHERE pack_id = $1 AND profile_a_id = $2 AND status IN ('pending','accepted') LIMIT 1`,
      [packRow.id, user.userId]
    );
    if (existing.length) return res.status(409).json({ success: false, error: 'Active challenge already exists' });

    const token = crypto.randomBytes(12).toString('hex');
    const repo = new PostgresH2HRepository();
    const row = await repo.createChallenge({
      packId: packRow.id,
      profileAId: user.userId,
      token,
      bonusAmount: 10,
      tiePolicy: 'split',
    });

    const link = `/packs/${packRow.pack_id || packRow.id}/h2h?t=${encodeURIComponent(row.token)}`;
    return res.status(200).json({ success: true, token: row.token, link });
  } catch (err) {
    console.error('[h2h/create]', err?.message || err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}


