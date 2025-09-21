import { getToken } from 'next-auth/jwt';
import { createRepositories } from '../../../lib/dal/factory';
import { query } from '../../../lib/db/postgres';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token || !token.profileID || !token.phone) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  const code = String(req.query.code || '').trim();
  if (!code) return res.status(400).json({ success: false, error: 'Missing code' });

  try {
    const { rows: profRows } = await query('SELECT id FROM profiles WHERE profile_id = $1 LIMIT 1', [token.profileID]);
    if (profRows.length === 0) return res.status(404).json({ success: false, error: 'Profile not found' });
    const profileRowId = profRows[0].id;

    const { awards } = createRepositories();
    const already = await awards.ensureUserRedemption(code, profileRowId);
    return res.status(200).json({ success: true, already });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[awards/check] error', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}



