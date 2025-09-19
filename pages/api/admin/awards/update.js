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

  const { code, name, tokens, status, validFrom, validTo, redirectTeamSlug, imageUrl } = req.body || {};
  if (!code) return res.status(400).json({ success: false, error: 'Missing code' });
  const updates = [];
  const params = [];
  let i = 1;
  if (typeof name === 'string') { updates.push(`name = $${i++}`); params.push(name); }
  if (Number.isFinite(Number(tokens))) { updates.push(`tokens = $${i++}`); params.push(Number(tokens)); }
  if (typeof status === 'string') { updates.push(`status = $${i++}`); params.push(status); }
  if (validFrom !== undefined) { updates.push(`valid_from = $${i++}`); params.push(validFrom || null); }
  if (validTo !== undefined) { updates.push(`valid_to = $${i++}`); params.push(validTo || null); }
  if (redirectTeamSlug !== undefined) { updates.push(`redirect_team_slug = $${i++}`); params.push(redirectTeamSlug || null); }
  if (imageUrl !== undefined) { updates.push(`image_url = $${i++}`); params.push(imageUrl || null); }
  if (updates.length === 0) return res.status(400).json({ success: false, error: 'No updates provided' });
  params.push(code);
  const sql = `UPDATE award_cards SET ${updates.join(', ')} WHERE code = $${i} RETURNING code`;
  try {
    const { rows } = await query(sql, params);
    if (!rows.length) return res.status(404).json({ success: false, error: 'Not found' });
    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Update failed' });
  }
}


