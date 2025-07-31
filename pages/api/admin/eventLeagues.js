import { getEventLeagues } from '../../../lib/airtableService';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
  try {
    const leagues = await getEventLeagues();
    return res.status(200).json({ success: true, leagues });
  } catch (error) {
    console.error('[api/admin/eventLeagues] Airtable fetch error =>', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch leagues' });
  }
} 