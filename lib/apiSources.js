// Centralized resolver for external data sources used by admin/api-tester

export function resolveSourceConfig(sourceInput) {
  const source = 'major-mlb';
  {
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
}


