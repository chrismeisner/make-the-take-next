// pages/api/h2h/match/[token]/finalize.js
import { PostgresH2HRepository } from '../../../../../lib/dal/postgres/h2h';
import { query } from '../../../../../lib/db/postgres';
import { sendSMS } from '../../../../../lib/twilioService';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });

  const { token } = req.query || {};
  if (!token) return res.status(400).json({ success: false, error: 'Missing token' });

  try {
    const repo = new PostgresH2HRepository();
    const finalized = await repo.finalizeByToken(String(token));
    if (!finalized) return res.status(404).json({ success: false, error: 'Not found or not ready' });

    // Phones
    const { rows: profs } = await query(
      `SELECT id, mobile_e164, username FROM profiles WHERE id IN ($1::uuid, $2::uuid)`,
      [finalized.profile_a_id, finalized.profile_b_id]
    );
    const pA = profs.find(p => String(p.id) === String(finalized.profile_a_id)) || {};
    const pB = profs.find(p => String(p.id) === String(finalized.profile_b_id)) || {};

    // Link
    const { rows: packRows } = await query(`SELECT pack_id FROM packs WHERE id = $1`, [finalized.pack_id]);
    const packTextId = packRows[0]?.pack_id || finalized.pack_id;
    const link = `/packs/${packTextId}/h2h?t=${encodeURIComponent(finalized.token)}`;

    // Message summary
    const winner = finalized.winner_profile_id
      ? (String(finalized.winner_profile_id) === String(finalized.profile_a_id) ? (pA.username || 'Player A') : (pB.username || 'Player B'))
      : 'Tie';
    const msg = `H2H results: ${winner}. A: ${finalized.a_correct} correct (${finalized.a_tokens} tok) vs B: ${finalized.b_correct} (${finalized.b_tokens}). Bonus: ${finalized.bonus_amount}. ${(process.env.NEXTAUTH_URL||'')}${link}`.trim();

    try {
      if (pA.mobile_e164) await sendSMS({ to: pA.mobile_e164, message: msg });
      if (pB.mobile_e164) await sendSMS({ to: pB.mobile_e164, message: msg });
    } catch (e) {
      console.warn('[h2h/finalize] SMS failed', e?.message || e);
    }

    return res.status(200).json({ success: true, matchup: finalized });
  } catch (err) {
    console.error('[h2h/finalize]', err?.message || err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}


