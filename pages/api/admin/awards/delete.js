import { getToken } from 'next-auth/jwt';
import { getDataBackend } from '../../../../lib/runtimeConfig';
import { query } from '../../../../lib/db/postgres';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
  if (getDataBackend() !== 'postgres') {
    return res.status(400).json({ success: false, error: 'Postgres-only' });
  }
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token || !token.phone) return res.status(401).json({ success: false, error: 'Unauthorized' });

  try {
    const { rows } = await query(`SELECT super_admin FROM profiles WHERE mobile_e164 = $1 LIMIT 1`, [token.phone]);
    if (!rows.length || !rows[0].super_admin) return res.status(403).json({ success: false, error: 'Forbidden' });
  } catch {
    return res.status(500).json({ success: false, error: 'Auth check failed' });
  }

  const { code } = req.body || {};
  if (!code) return res.status(400).json({ success: false, error: 'Missing code' });

  try {
    const { rowCount } = await query(`DELETE FROM award_cards WHERE code = $1`, [code]);
    if (!rowCount) return res.status(404).json({ success: false, error: 'Not found' });
    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Delete failed' });
  }
}


