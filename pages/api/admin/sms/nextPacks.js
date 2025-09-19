import { getToken } from 'next-auth/jwt';
import { query } from '../../../../lib/db/postgres';
import { getDataBackend } from '../../../../lib/runtimeConfig';

export default async function handler(req, res) {
  const backend = getDataBackend();
  if (backend !== 'postgres') {
    return res.status(400).json({ success: false, error: 'Postgres backend required' });
  }

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token || !token.superAdmin) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const { league: lg, limit: lim } = req.query || {};
    const league = (lg ? String(lg) : '').trim().toLowerCase();
    const limit = Math.min(200, Math.max(1, Number.parseInt(lim || '50', 10)));

    const args = [];
    let where = `LOWER(COALESCE(pack_status,'')) = 'coming-soon'`;
    if (league) {
      args.push(league);
      where += ` AND LOWER(COALESCE(league,'')) = $${args.length}`;
    }
    const { rows } = await query(
      `SELECT id, pack_id, pack_url, title, league, pack_open_time, pack_close_time
         FROM packs
        WHERE ${where}
        ORDER BY (pack_open_time::timestamptz) ASC NULLS LAST, created_at ASC
        LIMIT ${limit}`,
      args
    );

    return res.status(200).json({ success: true, league: league || null, packs: rows });
  } catch (error) {
    console.error('[admin/sms/nextPacks][GET] error =>', error);
    return res.status(500).json({ success: false, error: 'Failed to load upcoming packs' });
  }
}


