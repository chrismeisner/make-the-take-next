import Airtable from "airtable";

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY })
  .base(process.env.AIRTABLE_BASE_ID);

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
  try {
    // Fetch events directly from ESPN API for the given date (YYYY-MM-DD)
    const { date } = req.query;
    const dateStr = date
      ? date.replace(/-/g, '')
      : new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const url = `https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard?dates=${dateStr}`;
    const resp = await fetch(url);
    if (!resp.ok) {
      throw new Error(`ESPN API status ${resp.status}`);
    }
    const data = await resp.json();
    const events = await Promise.all((data.events || []).map(async (evt) => {
      // Extract basic fields
      const id = evt.id;
      const eventTime = evt.date;
      const eventTitle = evt.name;
      // Determine home/away teams
      let homeTeam = '', awayTeam = '', homeTeamId = null, awayTeamId = null;
      const comp = evt.competitions?.[0];
      if (comp && Array.isArray(comp.competitors)) {
        for (const c of comp.competitors) {
          if (c.homeAway === 'home') {
            homeTeam = c.team.displayName;
            homeTeamId = c.team.id?.toString();
          } else if (c.homeAway === 'away') {
            awayTeam = c.team.displayName;
            awayTeamId = c.team.id?.toString();
          }
        }
      }
      // Link to Teams table in Airtable for logo and link id
      let homeTeamLink = null, awayTeamLink = null, homeTeamLogo = null, awayTeamLogo = null;
      if (homeTeamId) {
        const recs = await base('Teams').select({
          filterByFormula: `AND({teamID}="${homeTeamId}", {teamLeague}="MLB")`,
          maxRecords: 1
        }).firstPage();
        if (recs.length) {
          homeTeamLink = recs[0].id;
          const logoURL = recs[0].fields.teamLogoURL;
          if (typeof logoURL === 'string') homeTeamLogo = logoURL.startsWith('@') ? logoURL.slice(1) : logoURL;
        }
      }
      if (awayTeamId) {
        const recs = await base('Teams').select({
          filterByFormula: `AND({teamID}="${awayTeamId}", {teamLeague}="MLB")`,
          maxRecords: 1
        }).firstPage();
        if (recs.length) {
          awayTeamLink = recs[0].id;
          const logoURL = recs[0].fields.teamLogoURL;
          if (typeof logoURL === 'string') awayTeamLogo = logoURL.startsWith('@') ? logoURL.slice(1) : logoURL;
        }
      }
      return {
        id,
        eventTime,
        eventTitle,
        homeTeam,
        awayTeam,
        homeTeamLink: homeTeamLink ? [homeTeamLink] : [],
        awayTeamLink: awayTeamLink ? [awayTeamLink] : [],
        homeTeamLogo,
        awayTeamLogo,
        espnLink: id,
      };
    }));
    return res.status(200).json({ success: true, events });
  } catch (error) {
    console.error('[api/events] ESPN fetch error =>', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch events from ESPN' });
  }
} 