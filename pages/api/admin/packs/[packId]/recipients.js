import { getToken } from 'next-auth/jwt';
import { query } from '../../../../../lib/db/postgres';
import { getDataBackend } from '../../../../../lib/runtimeConfig';

export default async function handler(req, res) {
  const backend = getDataBackend();
  if (backend !== 'postgres') {
    return res.status(400).json({ success: false, error: 'Postgres backend required' });
  }
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  const { packId } = req.query;
  if (!packId) {
    return res.status(400).json({ success: false, error: 'Missing packId parameter' });
  }

  try {
    // Resolve pack row by id/pack_id/pack_url for league and id
    const { rows: packRows } = await query(
      `SELECT id, pack_id, pack_url, title, league, pack_open_time, pack_close_time
         FROM packs
        WHERE id::text = $1 OR pack_id = $1 OR pack_url = $1
        LIMIT 1`,
      [String(packId)]
    );
    if (!packRows.length) {
      return res.status(404).json({ success: false, error: 'Pack not found' });
    }
    const pack = packRows[0];
    const league = (pack.league || '').toLowerCase();

    // Select recipients using same logic as queuePackOpen (league OR linked teams)
    const { rows: recRows } = await query(
      `WITH pack_teams AS (
         SELECT DISTINCT t.id AS team_id
           FROM packs p
           LEFT JOIN events e ON e.id = p.event_id
           LEFT JOIN packs_events pe ON pe.pack_id = p.id
           LEFT JOIN events e2 ON e2.id = pe.event_id
           LEFT JOIN props pr ON pr.pack_id = p.id
           LEFT JOIN props_teams pt ON pt.prop_id = pr.id
           LEFT JOIN teams t ON t.id = ANY(ARRAY[
             e.home_team_id, e.away_team_id,
             e2.home_team_id, e2.away_team_id,
             pt.team_id
           ])
          WHERE p.id = $2
       ),
       league_recipients AS (
         SELECT p.id AS profile_id, p.profile_id AS handle, p.mobile_e164 AS phone
           FROM profiles p
           JOIN notification_preferences np ON np.profile_id = p.id
          WHERE COALESCE(p.sms_opt_out_all, FALSE) = FALSE
            AND np.category = 'pack_open'
            AND np.league = $1
            AND np.opted_in = TRUE
            AND p.mobile_e164 IS NOT NULL
       ),
       team_recipients AS (
         SELECT p.id AS profile_id, p.profile_id AS handle, p.mobile_e164 AS phone
           FROM profiles p
           JOIN notification_preferences np ON np.profile_id = p.id
           JOIN pack_teams pk ON pk.team_id = np.team_id
          WHERE COALESCE(p.sms_opt_out_all, FALSE) = FALSE
            AND np.category = 'pack_open'
            AND np.opted_in = TRUE
            AND p.mobile_e164 IS NOT NULL
       ),
       all_recipients AS (
         SELECT DISTINCT profile_id, handle, phone FROM league_recipients
         UNION
         SELECT DISTINCT profile_id, handle, phone FROM team_recipients
       )
       SELECT profile_id::text, handle, phone FROM all_recipients
       ORDER BY handle NULLS LAST, phone ASC`,
      [league, pack.id]
    );

    const recipients = recRows.map(r => ({ profileID: r.handle || null, phone: r.phone }));
    return res.status(200).json({ success: true, recipients, count: recipients.length, pack: { id: String(pack.id), packId: pack.pack_id, packURL: pack.pack_url, league } });
  } catch (error) {
    console.error('[admin/packs/[packId]/recipients] error =>', error);
    return res.status(500).json({ success: false, error: 'Failed to load recipients' });
  }
}


