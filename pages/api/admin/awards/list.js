import { getToken } from 'next-auth/jwt';
import { query } from '../../../../lib/db/postgres';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token || !token.phone) return res.status(401).json({ success: false, error: 'Unauthorized' });
  try {
    const { rows } = await query(`SELECT super_admin FROM profiles WHERE mobile_e164 = $1 LIMIT 1`, [token.phone]);
    if (!rows.length || !rows[0].super_admin) return res.status(403).json({ success: false, error: 'Forbidden' });
  } catch {
    return res.status(500).json({ success: false, error: 'Auth check failed' });
  }

  const limit = Math.min(500, Number.parseInt(String(req.query.limit || '200'), 10) || 200);
  try {
    const { rows } = await query(
      `SELECT id, code, name, tokens, status, redeemed_at, valid_from, valid_to, redirect_team_slug, image_url, created_at,
              requirement_key, requirement_team_slug, requirement_team_id
         FROM award_cards
        ORDER BY created_at DESC
        LIMIT $1`,
      [limit]
    );
    return res.status(200).json({ success: true, awards: rows });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Query failed' });
  }
}


