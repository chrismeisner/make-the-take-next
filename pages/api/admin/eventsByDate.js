import { getCustomEventsByDate } from '../../../lib/airtableService';
import { getToken } from 'next-auth/jwt';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  const { date } = req.query;
  if (!date) {
    return res.status(400).json({ success: false, error: 'Missing date parameter' });
  }
  try {
    const events = await getCustomEventsByDate({ date });
    const formatted = events.map(evt => ({
      id: evt.id,
      eventTitle: evt.eventTitle,
      eventTime: evt.eventTime,
      eventLeague: evt.eventLeague,
      homeTeam: evt.homeTeam,
      awayTeam: evt.awayTeam,
      homeTeamLogo: evt.homeTeamLogo,
      awayTeamLogo: evt.awayTeamLogo,
      espnLink: evt.espnLink,
    }));
    return res.status(200).json({ success: true, events: formatted });
  } catch (err) {
    console.error('[api/admin/eventsByDate] Airtable fetch error =>', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch events' });
  }
} 