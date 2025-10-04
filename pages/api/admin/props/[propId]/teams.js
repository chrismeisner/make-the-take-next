import { getToken } from 'next-auth/jwt';
import { query } from '../../../../../lib/db/postgres';

export default async function handler(req, res) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) return res.status(401).json({ success: false, error: 'Unauthorized' });

  const { propId } = req.query;
  if (!propId) return res.status(400).json({ success: false, error: 'Missing propId' });

  try {
    // Resolve prop UUID from flexible identifier
    const { rows: pRows } = await query(
      `SELECT id FROM props WHERE id::text = $1 OR prop_id = $1 LIMIT 1`,
      [String(propId)]
    );
    if (!pRows.length) return res.status(404).json({ success: false, error: 'Prop not found' });
    const pid = pRows[0].id;

    if (req.method === 'GET') {
      const { rows } = await query(
        `SELECT t.id, t.team_id, t.team_slug, t.name, t.abbreviation, t.league, t.logo_url
           FROM props_teams pt
           JOIN teams t ON t.id = pt.team_id
          WHERE pt.prop_id = $1
          ORDER BY t.league, t.name`,
        [pid]
      );
      return res.status(200).json({ success: true, teams: rows });
    }

    if (req.method === 'PUT') {
      const { teamIds = [] } = req.body || {};
      const ids = Array.isArray(teamIds) ? teamIds.filter(Boolean).map(String) : [];

      await query('BEGIN');
      try {
        await query(`DELETE FROM props_teams WHERE prop_id = $1`, [pid]);
        if (ids.length > 0) {
          const values = ids.map((_, i) => `($1, $${i + 2})`).join(',');
          await query(
            `INSERT INTO props_teams (prop_id, team_id) VALUES ${values} ON CONFLICT DO NOTHING`,
            [pid, ...ids]
          );
        }
        await query('COMMIT');
      } catch (e) {
        await query('ROLLBACK').catch(() => {});
        // eslint-disable-next-line no-console
        console.error('[admin/props/[propId]/teams][PUT] error =>', e?.message || e);
        return res.status(500).json({ success: false, error: 'Failed to update linked teams' });
      }
      return res.status(200).json({ success: true, linked: ids.length });
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[admin/props/[propId]/teams] error =>', err?.message || err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}


