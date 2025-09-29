import { getCurrentUser } from "../../../lib/auth";
import { getDataBackend } from "../../../lib/runtimeConfig";
import { query } from "../../../lib/db/postgres";

export default async function handler(req, res) {
  const backend = getDataBackend();
  if (backend !== 'postgres') {
    return res.status(400).json({ success: false, error: 'Postgres backend required' });
  }
  const user = await getCurrentUser(req);
  if (!user || !user.userId) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
  try {
    const { rows } = await query(
      `SELECT t.id, t.team_slug, t.name, t.abbreviation, t.league
         FROM notification_preferences np
         JOIN teams t ON t.id = np.team_id
        WHERE np.profile_id = $1 AND np.category = 'pack_open' AND np.opted_in = TRUE
        ORDER BY t.league, t.name`,
      [user.userId]
    );
    const teams = rows.map((r) => ({ id: r.id, teamSlug: r.team_slug, name: r.name, abv: r.abbreviation, league: r.league }));
    return res.status(200).json({ success: true, teams });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[notifications/teamPreferences][GET] error =>', err);
    return res.status(500).json({ success: false, error: 'Failed to load team preferences' });
  }
}
