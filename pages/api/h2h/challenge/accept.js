// pages/api/h2h/challenge/accept.js
import { getCurrentUser } from '../../../../lib/auth';
import { query } from '../../../../lib/db/postgres';
import { PostgresH2HRepository } from '../../../../lib/dal/postgres/h2h';
import { sendSMS } from '../../../../lib/twilioService';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });
  const user = await getCurrentUser(req);
  if (!user || !user.userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

  try {
    const { token } = req.body || {};
    if (!token) return res.status(400).json({ success: false, error: 'Missing token' });

    const repo = new PostgresH2HRepository();
    const updated = await repo.acceptChallenge({ token, profileBId: user.userId });
    if (!updated) return res.status(404).json({ success: false, error: 'Matchup not found or already accepted' });
    if (!updated.profile_b_id) return res.status(409).json({ success: false, error: 'Already accepted by someone else' });

    // Load phone numbers for SMS
    const { rows: profs } = await query(
      `SELECT id, mobile_e164 FROM profiles WHERE id IN ($1::uuid, $2::uuid)`,
      [updated.profile_a_id, updated.profile_b_id]
    );
    const phoneA = profs.find(p => String(p.id) === String(updated.profile_a_id))?.mobile_e164 || null;
    const phoneB = profs.find(p => String(p.id) === String(updated.profile_b_id))?.mobile_e164 || null;

    // Build link (pack_id text if set; fallback to UUID)
    const { rows: packRows } = await query(`SELECT pack_id FROM packs WHERE id = $1`, [updated.pack_id]);
    const packTextId = packRows[0]?.pack_id || updated.pack_id;
    const link = `/packs/${packTextId}/h2h?t=${encodeURIComponent(updated.token)}`;

    // Send SMS if both numbers exist
    try {
      const message = `Your H2H is set! View matchup: ${process.env.NEXTAUTH_URL || ''}${link}`.trim();
      if (phoneA) await sendSMS({ to: phoneA, message });
      if (phoneB) await sendSMS({ to: phoneB, message });
    } catch (e) {
      console.warn('[h2h/accept] SMS failed', e?.message || e);
    }

    return res.status(200).json({ success: true, link });
  } catch (err) {
    console.error('[h2h/accept]', err?.message || err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}


