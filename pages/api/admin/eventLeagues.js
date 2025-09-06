import { getEventLeagues } from '../../../lib/airtableService';
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
    const leagues = await getEventLeagues();
    return res.status(200).json({ success: true, leagues });
  } catch (error) {
    console.error('[api/admin/eventLeagues] fetch error =>', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch leagues' });
  }
} 