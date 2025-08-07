import { getCustomEventsByDate } from '../../../lib/airtableService';
import { getToken } from 'next-auth/jwt';
import Airtable from 'airtable';
const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  const { date, league } = req.query;
  if (!date) {
    return res.status(400).json({ success: false, error: 'Missing date parameter' });
  }
  console.log(`[api/admin/eventsByDate] Check events pressed for date=${date}, league=${league}`);
  try {
    // 1) Load custom events from Airtable
    let events = await getCustomEventsByDate({ date });
    // 2) Filter by league if provided
    const leagueLower = league?.toLowerCase();
    if (leagueLower) {
      events = events.filter(evt => String(evt.eventLeague).toLowerCase() === leagueLower);
    }
    // 3) Resolve teamLogoURL for each linked team record
    const eventsWithLogos = await Promise.all(events.map(async (evt) => {
      let homeTeamLogo = null;
      if (Array.isArray(evt.homeTeamLink) && evt.homeTeamLink.length) {
        try {
          const rec = await base('Teams').find(evt.homeTeamLink[0]);
          homeTeamLogo = rec.fields.teamLogoURL || null;
        } catch {}
      }
      let awayTeamLogo = null;
      if (Array.isArray(evt.awayTeamLink) && evt.awayTeamLink.length) {
        try {
          const rec = await base('Teams').find(evt.awayTeamLink[0]);
          awayTeamLogo = rec.fields.teamLogoURL || null;
        } catch {}
      }
      return { ...evt, homeTeamLogo, awayTeamLogo };
    }));
    // 4) Format the final output
    const formatted = eventsWithLogos.map(evt => ({
      id: evt.id,
      eventTitle: evt.eventTitle,
      eventTime: evt.eventTime,
      eventLeague: evt.eventLeague,
      homeTeam: evt.homeTeam,
      awayTeam: evt.awayTeam,
      // Include link fields for team IDs
      homeTeamLink: evt.homeTeamLink,
      awayTeamLink: evt.awayTeamLink,
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