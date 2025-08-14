export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { eventId, league, providerId } = req.query;
  if (!eventId || !league || !providerId) {
    return res.status(400).json({ error: 'Missing query parameters. Required: eventId, league, providerId' });
  }

  const [sport, leagueName] = league.split('/');
  if (!sport || !leagueName) {
    return res.status(400).json({ error: 'Invalid league format. Use sport/league' });
  }

  console.log(`[Vegas Odds] Fetching all odds for eventId=${eventId}, league=${league}`);
  const url = `https://sports.core.api.espn.com/v2/sports/${sport}/leagues/${leagueName}/events/${eventId}/competitions/${eventId}/odds?limit=1000`;

  try {
    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!response.ok) {
      console.error(`[Vegas Odds] ESPN API returned status ${response.status}`);
      return res.status(response.status).json({ error: `ESPN API returned status ${response.status}` });
    }
    const fetched = await response.json();
    const items = Array.isArray(fetched.items) ? fetched.items : [];
    console.log(`[Vegas Odds] Retrieved ${items.length} total odds entries`);
    const match = items.find((entry) => String(entry.provider.id) === providerId);
    if (!match) {
      console.warn(`[Vegas Odds] No odds found for providerId=${providerId}`);
      return res.status(404).json({ error: `No odds found for provider ${providerId}` });
    }
    console.log(`[Vegas Odds] Found odds for providerId=${providerId}`);
    // Fetch summary endpoint to get team names (robust across shapes)
    let awayName = null;
    let homeName = null;
    try {
      const summaryUrl = `https://site.api.espn.com/apis/site/v2/sports/${sport}/${leagueName}/summary?event=${eventId}`;
      console.log(`[Vegas Odds] Fetching summary from: ${summaryUrl}`);
      const sumRes = await fetch(summaryUrl, { headers: { Accept: 'application/json' } });
      if (sumRes.ok) {
        const sumData = await sumRes.json();
        const competitions = (sumData && (
          sumData.header?.competitions ||
          sumData.competitions ||
          sumData.game?.competitions
        )) || [];
        const competitors = Array.isArray(competitions) && competitions.length
          ? competitions[0]?.competitors || []
          : [];
        const awayComp = competitors.find((c) => c.homeAway === 'away');
        const homeComp = competitors.find((c) => c.homeAway === 'home');
        awayName = awayComp?.team?.displayName || awayComp?.team?.shortDisplayName || null;
        homeName = homeComp?.team?.displayName || homeComp?.team?.shortDisplayName || null;
      } else {
        console.warn(`[Vegas Odds] Summary fetch failed with status ${sumRes.status}`);
      }
    } catch (err) {
      console.error('[Vegas Odds] Error fetching or parsing summary:', err);
    }
    console.log(`[Vegas Odds] Teams: away="${awayName}", home="${homeName}"`);
    console.log(`[Vegas Odds] Moneylines: away=${match.awayTeamOdds.moneyLine}, home=${match.homeTeamOdds.moneyLine}`);
    // Return the odds payload plus team names for debugging/optional use
    return res.status(200).json({ ...match, teams: { awayName, homeName } });
  } catch (error) {
    console.error('[Vegas Odds] Fetch error', error);
    return res.status(500).json({ error: error.message });
  }
}
