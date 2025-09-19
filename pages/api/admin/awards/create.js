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
  // Basic super-admin gate: must be super_admin profile
  try {
    const { rows } = await query(
      `SELECT super_admin FROM profiles WHERE mobile_e164 = $1 LIMIT 1`,
      [token.phone]
    );
    const isSuper = Boolean(rows?.[0]?.super_admin);
    if (!isSuper) return res.status(403).json({ success: false, error: 'Forbidden' });
  } catch {
    return res.status(500).json({ success: false, error: 'Auth check failed' });
  }

  const { name, tokens, code, validFrom, validTo, redirectTeamSlug, imageUrl } = req.body || {};
  if (!name || !tokens) return res.status(400).json({ success: false, error: 'Missing required fields' });
  const safeTokens = Number.parseInt(tokens, 10);
  if (!Number.isFinite(safeTokens) || safeTokens <= 0) return res.status(400).json({ success: false, error: 'Invalid tokens' });
  const providedCode = String(code || '').trim();
  const sql = `INSERT INTO award_cards (code, name, tokens, valid_from, valid_to, redirect_team_slug, image_url) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING code`;
  const genCode = providedCode || (Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10)).slice(0, 12);

  try {
    const { rows } = await query(sql, [genCode, name, safeTokens, validFrom || null, validTo || null, redirectTeamSlug || null, imageUrl || null]);
    return res.status(200).json({ success: true, code: rows[0].code });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Create failed' });
  }
}


