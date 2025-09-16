import { getDataBackend } from '../../../lib/runtimeConfig';
import { query } from '../../../lib/db/postgres';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
  try {
    if (getDataBackend() === 'postgres') {
      const { rows } = await query(`SELECT DISTINCT LOWER(league) AS league FROM events WHERE league IS NOT NULL ORDER BY league ASC`);
      const leagues = rows.map(r => r.league);
      return res.status(200).json({ success: true, leagues });
    }
    return res.status(400).json({ success: false, error: 'Unsupported in Postgres mode' });
  } catch (error) {
    console.error('[api/admin/eventLeagues] fetch error =>', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch leagues' });
  }
} 