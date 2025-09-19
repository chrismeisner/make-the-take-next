import { getToken } from 'next-auth/jwt';
import { query } from '../../../../lib/db/postgres';
import { getDataBackend } from '../../../../lib/runtimeConfig';

export default async function handler(req, res) {
  const backend = getDataBackend();
  if (backend !== 'postgres') {
    return res.status(400).json({ success: false, error: 'Postgres backend required' });
  }

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token || !token.superAdmin) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const { ruleId, rule_key, league: leagueParam } = req.query || {};
    let league = (leagueParam ? String(leagueParam) : '').trim().toLowerCase();

    if (!league && (ruleId || rule_key)) {
      const where = ruleId ? 'id = $1' : 'rule_key = $1';
      const value = ruleId ? ruleId : String(rule_key).trim().toLowerCase();
      const { rows } = await query(`SELECT league FROM sms_rules WHERE ${where} LIMIT 1`, [value]);
      league = (rows[0]?.league || '').trim().toLowerCase();
    }

    if (!league) {
      return res.status(400).json({ success: false, error: 'league required (or provide ruleId/rule_key with a league)' });
    }

    const { rows } = await query(
      `SELECT p.id AS profile_id, p.profile_id AS profile_text_id, p.mobile_e164 AS phone
         FROM profiles p
         JOIN notification_preferences np ON np.profile_id = p.id
        WHERE COALESCE(p.sms_opt_out_all, FALSE) = FALSE
          AND np.category = 'pack_open'
          AND np.league = $1
          AND np.opted_in = TRUE
          AND p.mobile_e164 IS NOT NULL
        ORDER BY p.created_at DESC
        LIMIT 1000`,
      [league]
    );

    return res.status(200).json({ success: true, league, recipients: rows, count: rows.length });
  } catch (error) {
    console.error('[admin/sms/recipients][GET] error =>', error);
    return res.status(500).json({ success: false, error: 'Failed to load recipients' });
  }
}


