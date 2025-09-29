import { getCurrentUser } from "../../../lib/auth";
import { query } from "../../../lib/db/postgres";

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
  const user = await getCurrentUser(req);
  if (!user) {
    return res.status(401).json({ success: false, error: 'Not authenticated' });
  }
  const teamSlug = String(req.query.teamSlug || '').trim();
  if (!teamSlug) {
    return res.status(400).json({ success: false, error: 'Missing teamSlug' });
  }
  try {
    const { rows: teamRows } = await query('SELECT id FROM teams WHERE team_slug = $1 LIMIT 1', [teamSlug]);
    if (!teamRows?.length) {
      return res.status(404).json({ success: false, error: 'Team not found' });
    }
    const teamId = teamRows[0].id;

    const { rows: profRows } = await query('SELECT id FROM profiles WHERE profile_id = $1 LIMIT 1', [user.profileID]);
    if (!profRows?.length) {
      return res.status(404).json({ success: false, error: 'Profile not found' });
    }
    const profileRowId = profRows[0].id;

    // Check explicit team follow
    const { rows: prefRows } = await query(
      `SELECT opted_in FROM notification_preferences
         WHERE profile_id = $1 AND category = 'pack_open' AND team_id = $2
         LIMIT 1`,
      [profileRowId, teamId]
    );
    const followsTeam = prefRows?.length ? Boolean(prefRows[0].opted_in) : false;

    // Return basic status
    return res.status(200).json({ success: true, followsTeam });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[follow/status] error', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}
