import { getCurrentUser } from "../../../lib/auth";
import { query } from "../../../lib/db/postgres";

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
  const user = await getCurrentUser(req);
  if (!user) {
    return res.status(401).json({ success: false, error: 'Not authenticated' });
  }
  const teamSlug = String(req.body?.teamSlug || '').trim();
  if (!teamSlug) {
    return res.status(400).json({ success: false, error: 'Missing teamSlug' });
  }
  try {
    const { rows: teamRows } = await query(
      `SELECT id FROM teams 
         WHERE LOWER(team_slug) = LOWER($1)
            OR LOWER(abbreviation) = LOWER($1)
         LIMIT 1`,
      [teamSlug]
    );
    if (!teamRows?.length) {
      return res.status(404).json({ success: false, error: 'Team not found' });
    }
    const teamId = teamRows[0].id;

    const { rows: profRows } = await query('SELECT id FROM profiles WHERE profile_id = $1 LIMIT 1', [user.profileID]);
    if (!profRows?.length) {
      return res.status(404).json({ success: false, error: 'Profile not found' });
    }
    const profileRowId = profRows[0].id;

    await query(
      `INSERT INTO notification_preferences (profile_id, category, team_id, opted_in)
         VALUES ($1, 'pack_open', $2, TRUE)
       ON CONFLICT (profile_id, category, team_id)
         DO UPDATE SET opted_in = EXCLUDED.opted_in, updated_at = NOW()`,
      [profileRowId, teamId]
    );
    return res.status(200).json({ success: true });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[follow/team] error', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}


