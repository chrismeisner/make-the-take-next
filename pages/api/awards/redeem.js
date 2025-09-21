import { getToken } from 'next-auth/jwt';
import { createRepositories } from '../../../lib/dal/factory';
import { query } from '../../../lib/db/postgres';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token || !token.profileID || !token.phone) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  const { code } = req.body || {};
  const trimmed = String(code || '').trim();
  if (!trimmed) return res.status(400).json({ success: false, error: 'Missing code' });

  try {
    // Resolve profile row id
    const { rows: profRows } = await query('SELECT id FROM profiles WHERE profile_id = $1 LIMIT 1', [token.profileID]);
    if (profRows.length === 0) return res.status(404).json({ success: false, error: 'Profile not found' });
    const profileRowId = profRows[0].id;

    const { awards } = createRepositories();
    const result = await awards.redeemAvailableByCode(trimmed, profileRowId);
    if (!result) return res.status(409).json({ success: false, error: 'Code unavailable or invalid window' });
    const already = Boolean(result.alreadyRedeemed);
    return res.status(200).json({ success: true, code: result.code, name: result.name, tokens: Number(result.tokens) || 0, redirectTeamSlug: result.redirect_team_slug || null, imageUrl: result.image_url || null, already });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[awards/redeem] error', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}


