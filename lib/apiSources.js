// Centralized resolver for external data sources used by admin/api-tester

export function resolveSourceConfig(sourceInput) {
  const input = String(sourceInput || '').toLowerCase();

  // MLB (existing)
  if (!input || input === 'mlb' || input === 'major-mlb') {
    const source = 'major-mlb';
    const key = process.env.RAPIDAPI_KEY;
    const host = process.env.RAPIDAPI_MLB_HOST || 'major-league-baseball-mlb.p.rapidapi.com';
    return {
      ok: !!key,
      source,
      key,
      host,
      headers: {
        'x-rapidapi-key': key,
        'x-rapidapi-host': host,
      },
      endpoints: {
        // This API uses a different shape; boxScore expects gameId param name
        boxScore: '/boxscore',
        scoreboard: '/scoreboard',
        // Daily schedule by year/month/day
        schedule: '/schedule',
        // Team info by id
        teamInfo: '/team-info',
        teamRoster: '/team-roster',
      },
      params: {
        boxScoreGameIdParam: 'eventId',
      },
      supports: {
        status: true,
        players: true,
        boxScore: true,
      },
    };
  }

  // NFL (schedule weekly via nfl-api1)
  if (input === 'nfl') {
    const source = 'nfl';
    const key = process.env.RAPIDAPI_KEY;
    const host = process.env.RAPIDAPI_NFL_HOST || 'nfl-api1.p.rapidapi.com';
    return {
      ok: !!key,
      source,
      key,
      host,
      headers: {
        'x-rapidapi-key': key,
        'x-rapidapi-host': host,
      },
      endpoints: {
        // From user-provided cURL: /nfl-schedule-weekly?year=YYYY&week=W
        scoreboard: '/nfl-schedule-weekly',
        // Box score endpoint: /nflboxscore?id={gameId}
        boxScore: '/nflboxscore',
        // Players by Team ID endpoint (simple list)
        playersByTeamId: '/players/id',
        // Team players endpoint with rich athlete objects (includes position)
        teamPlayers: '/nflteamplayers',
      },
      params: {},
      supports: {
        status: true,
        players: true,
        boxScore: true,
      },
    };
  }

  // Default to MLB if unknown
  const mlb = resolveSourceConfig('major-mlb');
  return { ...mlb, source: 'major-mlb' };
}


