// File: /pages/api/scores.js

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { league, event } = req.query;
  if (!league || !event) {
    return res.status(400).json({ success: false, error: 'Missing league or event query param' });
  }

  function toPathLeague(raw) {
    const lower = String(raw || '').toLowerCase();
    if (lower.includes('/')) return lower;
    switch (lower) {
      case 'mlb': return 'baseball/mlb';
      case 'nba': return 'basketball/nba';
      case 'nfl': return 'football/nfl';
      case 'nhl': return 'hockey/nhl';
      case 'ncaam': return 'basketball/mens-college-basketball';
      case 'ncaaw': return 'basketball/womens-college-basketball';
      case 'ncaaf': return 'football/college-football';
      default: return `baseball/${lower}`; // naive fallback
    }
  }

  const pathLeague = toPathLeague(league);
  const url = `https://site.api.espn.com/apis/site/v2/sports/${pathLeague}/summary?event=${encodeURIComponent(event)}`;

  try {
    const resp = await fetch(url);
    if (!resp.ok) {
      return res.status(resp.status).json({ success: false, error: `ESPN returned ${resp.status}` });
    }
    const json = await resp.json();

    // Try to normalize from header.competitions[0].competitors
    const header = json && json.header ? json.header : {};
    const competitions = Array.isArray(header.competitions) ? header.competitions : [];
    const comp = competitions[0] || {};
    const competitors = Array.isArray(comp.competitors) ? comp.competitors : [];
    const statusType = (comp.status && comp.status.type) || {};
    const status = {
      state: statusType.state || '',
      detail: statusType.detail || '',
      shortDetail: statusType.shortDetail || '',
      description: statusType.description || statusType.name || '',
    };

    function pickTeam(side) {
      const t = competitors.find((c) => String(c.homeAway || c.homeaway || '').toLowerCase() === side);
      if (!t) return null;
      const team = t.team || {};
      const name = team.displayName || team.shortDisplayName || team.name || '';
      const abbr = team.abbreviation || '';
      const score = typeof t.score === 'number' ? t.score : Number(t.score || 0);
      return { name, abbreviation: abbr, score: isNaN(score) ? 0 : score };
    }

    const home = pickTeam('home');
    const away = pickTeam('away');

    // Cache briefly to reduce load but keep fresh
    res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=30');
    return res.status(200).json({ success: true, status, home, away, lastUpdated: new Date().toISOString() });
  } catch (err) {
    console.error('[api/scores] error', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch ESPN summary' });
  }
}


