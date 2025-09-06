import { getCustomEventsByDate } from '../../../lib/airtableService';
import { getToken } from 'next-auth/jwt';
import Airtable from 'airtable';
import { getDataBackend } from '../../../lib/runtimeConfig';
import { query } from '../../../lib/db/postgres';
const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  const { date, league, tz = 'America/New_York' } = req.query;
  if (!date) {
    return res.status(400).json({ success: false, error: 'Missing date parameter' });
  }
  console.log(`[api/admin/eventsByDate] Check events pressed for date=${date}, league=${league}`);
  try {
    const backend = getDataBackend();
    if (backend === 'postgres') {
      const dayStr = date; // assume YYYY-MM-DD
      const params = [];
      let i = 1;
      let sql = `SELECT id,
                        title      AS "eventTitle",
                        event_time AS "eventTime",
                        league     AS "eventLeague"
                   FROM events
                  WHERE (timezone($${i++}, event_time))::date = $${i++}::date`;
      params.push(String(tz));
      params.push(dayStr);
      if (league) {
        sql += ` AND LOWER(COALESCE(league,'')) = $${i++}`;
        params.push(String(league).toLowerCase());
      }
      sql += ' ORDER BY event_time ASC';
      const { rows } = await query(sql, params);
      return res.status(200).json({ success: true, events: rows });
    }

    // Airtable (timezone-aware)
    let events = await getCustomEventsByDate({ date, timeZone: tz });
    const leagueLower = league?.toLowerCase();
    if (leagueLower) {
      events = events.filter(evt => String(evt.eventLeague).toLowerCase() === leagueLower);
    }
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
    const formatted = eventsWithLogos.map(evt => ({
      id: evt.id,
      eventTitle: evt.eventTitle,
      eventTime: evt.eventTime,
      eventLeague: evt.eventLeague,
      homeTeam: evt.homeTeam,
      awayTeam: evt.awayTeam,
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