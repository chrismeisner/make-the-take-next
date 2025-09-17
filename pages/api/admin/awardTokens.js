import { getToken } from 'next-auth/jwt';
import { getDataBackend } from '../../../lib/runtimeConfig';
import { query } from '../../../lib/db/postgres';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token || !token.userId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    // Optional: require super admin
    if (!token.superAdmin) {
      return res.status(403).json({ success: false, error: 'Forbidden: super admin required' });
    }

    if (getDataBackend() !== 'postgres') {
      return res.status(400).json({ success: false, error: 'Postgres backend required' });
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const latestOnly = Boolean(body.latestOnly ?? false);
    const dryRun = Boolean(body.dryRun ?? false);

    const whereClause = latestOnly
      ? "WHERE t.take_status = 'latest' AND COALESCE(t.tokens, -1) <> FLOOR(COALESCE(t.take_pts,0) * 0.05)"
      : "WHERE COALESCE(t.tokens, -1) <> FLOOR(COALESCE(t.take_pts,0) * 0.05)";

    // Preview count
    const countSql = `SELECT COUNT(*)::int AS to_update FROM takes t ${whereClause}`;
    const { rows: preview } = await query(countSql);
    const toUpdate = Number(preview?.[0]?.to_update) || 0;

    if (dryRun) {
      return res.status(200).json({ success: true, dryRun: true, toUpdate });
    }

    // Perform update
    const updateSql = `UPDATE takes t SET tokens = FLOOR(COALESCE(t.take_pts,0) * 0.05) ${whereClause}`;
    const result = await query(updateSql);
    const updatedCount = typeof result.rowCount === 'number' ? result.rowCount : 0;

    return res.status(200).json({ success: true, updatedCount, toUpdate });
  } catch (err) {
    console.error('[/api/admin/awardTokens] Error =>', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}


