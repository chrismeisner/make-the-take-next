import Airtable from 'airtable';
import { getToken } from 'next-auth/jwt';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  // Provide static formulas (seed) now that Airtable is removed
  const formulas = [
    {
      formulaKey: 'who_wins',
      displayName: 'Who Wins',
      description: 'Grades a moneyline/who-wins prop using NFL boxscore/weekly scoreboard or MLB scoreboard.',
      dataSource: 'nfl',
      defaultParams: { gradingType: 'team', metric: 'winner' },
      leagues: [],
      active: true,
    },
    {
      formulaKey: 'stat_over_under',
      displayName: 'Player Single Stat O/U',
      description: 'Grades a single player stat against side thresholds.',
      dataSource: 'nfl',
      defaultParams: { gradingType: 'player_stat_ou' },
      leagues: [],
      active: true,
    },
  ];
  return res.status(200).json({ success: true, formulas });
}


