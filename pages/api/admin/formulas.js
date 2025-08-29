import Airtable from 'airtable';
import { getToken } from 'next-auth/jwt';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  const baseId = process.env.AIRTABLE_BASE_ID;
  const apiKey = process.env.AIRTABLE_API_KEY;
  if (!baseId || !apiKey) {
    return res.status(500).json({ success: false, error: 'Airtable not configured' });
  }

  // Show all formulas regardless of league

  const base = new Airtable({ apiKey }).base(baseId);
  try {
    const records = await base('Formulas')
      .select({
        // Keep small for admin usage; adjust as needed
        pageSize: 100,
        // Prefer only active formulas if the field exists
        // We'll filter client-side too in case the field is missing
      })
      .all();

    const formulas = records
      .map((rec) => {
        const f = rec.fields || {};
        let defaultParams = {};
        try {
          if (typeof f.defaultParams === 'string' && f.defaultParams.trim()) {
            defaultParams = JSON.parse(f.defaultParams);
          } else if (typeof f.defaultParams === 'object' && f.defaultParams) {
            defaultParams = f.defaultParams;
          }
        } catch {}
        const leagues = Array.isArray(f.leagues) ? f.leagues : (f.league ? [f.league] : []);
        return {
          formulaKey: String(f.formulaKey || '').trim() || rec.id,
          displayName: String(f.displayName || f.formulaKey || rec.id || '').trim(),
          description: String(f.description || '').trim(),
          dataSource: String(f.dataSource || 'major-mlb').trim(),
          defaultParams,
          leagues,
          // Airtable checkbox → strict boolean
          active: Boolean(f.active === true),
        };
      })
      // Only return active formulas; ignore league scoping
      .filter((f) => f.active);

    // Fallback seed if table is empty
    const seedWhoWins = {
      formulaKey: 'who_wins',
      displayName: 'Who Wins',
      description: 'Grades a moneyline/who-wins prop using Major MLB scoreboard (final winner).',
      dataSource: 'major-mlb',
      defaultParams: { gradingType: 'team', metric: 'winner' },
      leagues: [],
      active: true,
    };
    const final = formulas.length ? formulas : [seedWhoWins];
    return res.status(200).json({ success: true, formulas: final });
  } catch (e) {
    // On failure, still provide a minimal fallback so UI can function
    return res.status(200).json({
      success: true,
      warning: e.message || 'Failed to load formulas; using fallback',
      formulas: [
        {
          formulaKey: 'who_wins',
          displayName: 'Who Wins',
          description: 'Grades a moneyline/who-wins prop using Major MLB scoreboard (final winner).',
          dataSource: 'major-mlb',
          defaultParams: { gradingType: 'team', metric: 'winner' },
          leagues: [],
          active: true,
        },
      ],
    });
  }
}


