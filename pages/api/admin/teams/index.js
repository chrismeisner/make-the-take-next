import { getToken } from 'next-auth/jwt';
import { createRepositories } from '../../../../lib/dal/factory';

export default async function handler(req, res) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  const { teams } = createRepositories();

  if (req.method === 'GET') {
    try {
      const list = await teams.listAll();
      return res.status(200).json({ success: true, teams: list });
    } catch (e) {
      console.error('[admin/teams] list error', e);
      return res.status(500).json({ success: false, error: e.message });
    }
  }

  if (req.method === 'POST') {
    try {
      const body = req.body || {};
      // Special mode: trigger fetch/populate for a league when body.mode === 'fetch'
      if (body.mode === 'fetch') {
        const league = String(body.league || 'nfl').toLowerCase();
        // For simplicity, define a small static set for NFL abbreviations if DAL lacks fetcher
        const seed = league === 'nfl' ? [
          { teamID: 'NFL-DAL', teamName: 'Dallas Cowboys', teamAbbreviation: 'DAL', teamLeague: 'nfl' },
          { teamID: 'NFL-PHI', teamName: 'Philadelphia Eagles', teamAbbreviation: 'PHI', teamLeague: 'nfl' },
          { teamID: 'NFL-KC', teamName: 'Kansas City Chiefs', teamAbbreviation: 'KC', teamLeague: 'nfl' },
        ] : [];
        let created = 0;
        let updated = 0;
        let total = 0;
        for (const t of seed) {
          try {
            // Try create; if conflict handling lives inside DAL upsert, it will convert to update
            const resCreate = await teams.createOne(t);
            total += 1;
            created += resCreate?.id ? 1 : 0;
            // eslint-disable-next-line no-console
            console.log('[admin/teams] created/upserted', { league: t.teamLeague, slug: t.teamAbbreviation, teamID: t.teamID, id: resCreate?.id });
          } catch (e) {
            // eslint-disable-next-line no-console
            console.log('[admin/teams] create error, attempting update', { slug: t.teamAbbreviation, error: e?.message });
            const resUpdate = await teams.updateOne(t.teamID, t);
            total += 1;
            updated += resUpdate?.id ? 1 : 0;
            // eslint-disable-next-line no-console
            console.log('[admin/teams] updated', { league: t.teamLeague, slug: t.teamAbbreviation, teamID: t.teamID, id: resUpdate?.id });
          }
        }
        // eslint-disable-next-line no-console
        console.log('[admin/teams] fetch summary', { league, created, updated, total });
        return res.status(200).json({ success: true, created, updated, total });
      }

      // Default: create from provided body
      const created = await teams.createOne(body);
      return res.status(200).json({ success: true, team: created });
    } catch (e) {
      console.error('[admin/teams] create error', e);
      return res.status(500).json({ success: false, error: e.message });
    }
  }

  return res.status(405).json({ success: false, error: 'Method not allowed' });
}


