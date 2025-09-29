// pages/api/h2h/match/[token].js
import { PostgresH2HRepository } from '../../../../lib/dal/postgres/h2h';
import { query } from '../../../../lib/db/postgres';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });
  const { token } = req.query || {};
  if (!token) return res.status(400).json({ success: false, error: 'Missing token' });

  try {
    const repo = new PostgresH2HRepository();
    const row = await repo.getByToken(String(token));
    if (!row) return res.status(404).json({ success: false, error: 'Not found' });

    // Inflate minimal profile info
    const { rows: profiles } = await query(
      `SELECT id, username, profile_id, mobile_e164 FROM profiles WHERE id IN ($1::uuid, $2::uuid)`,
      [row.profile_a_id, row.profile_b_id]
    );
    const prof = (id) => profiles.find(p => String(p.id) === String(id)) || null;

    // Resolve pack text id
    const { rows: pRows } = await query(`SELECT pack_id, title, league, pack_status FROM packs WHERE id = $1 LIMIT 1`, [row.pack_id]);
    const pack = pRows[0] || {};

    return res.status(200).json({
      success: true,
      matchup: {
        token: row.token,
        status: row.status,
        packId: pack.pack_id || row.pack_id,
        packStatus: pack.pack_status || null,
        profileA: prof(row.profile_a_id),
        profileB: prof(row.profile_b_id),
        aCorrect: row.a_correct,
        bCorrect: row.b_correct,
        aTokens: row.a_tokens,
        bTokens: row.b_tokens,
        winnerProfileId: row.winner_profile_id,
        bonusAmount: row.bonus_amount,
        tiePolicy: row.tie_policy,
        bonusSplitA: row.bonus_split_a,
        bonusSplitB: row.bonus_split_b,
        createdAt: row.created_at,
        acceptedAt: row.accepted_at,
        finalizedAt: row.finalized_at,
      }
    });
  } catch (err) {
    console.error('[h2h/match]', err?.message || err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}


