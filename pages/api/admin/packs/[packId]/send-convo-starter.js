import { getToken } from 'next-auth/jwt';
import { query } from '../../../../../lib/db/postgres';
import { sendSMS } from '../../../../../lib/twilioService';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  const { packId } = req.query;
  if (!packId) {
    return res.status(400).json({ success: false, error: 'Missing packId' });
  }

  try {
    // Load pack info
    const { rows: packRows } = await query(
      `SELECT id, pack_url, title, COALESCE(drop_strategy,'link') AS drop_strategy
         FROM packs
        WHERE id::text = $1 OR pack_id = $1 OR pack_url = $1
        LIMIT 1`,
      [String(packId)]
    );
    if (!packRows.length) {
      return res.status(404).json({ success: false, error: 'Pack not found' });
    }
    const pack = packRows[0];
    const isConversation = String(pack.drop_strategy || 'link').toLowerCase() === 'sms_conversation';

    if (!isConversation) {
      return res.status(400).json({ success: false, error: 'Pack is not configured for SMS conversation' });
    }

    // Find recipients using existing recipients query logic
    const { rows: recipients } = await query(
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
          WHERE p.id = $1
       ),
       league_recipients AS (
         SELECT p.id AS profile_id, p.mobile_e164 AS phone
           FROM profiles p
           JOIN notification_preferences np ON np.profile_id = p.id
          WHERE COALESCE(p.sms_opt_out_all, FALSE) = FALSE
            AND np.category = 'pack_open'
            AND np.opted_in = TRUE
            AND p.mobile_e164 IS NOT NULL
       ),
       team_recipients AS (
         SELECT p.id AS profile_id, p.mobile_e164 AS phone
           FROM profiles p
           JOIN notification_preferences np ON np.profile_id = p.id
           JOIN pack_teams pk ON pk.team_id = np.team_id
          WHERE COALESCE(p.sms_opt_out_all, FALSE) = FALSE
            AND np.category = 'pack_open'
            AND np.opted_in = TRUE
            AND p.mobile_e164 IS NOT NULL
       ),
       all_recipients AS (
         SELECT DISTINCT profile_id, phone FROM league_recipients
         UNION
         SELECT DISTINCT profile_id, phone FROM team_recipients
       )
       SELECT profile_id, phone FROM all_recipients`,
      [pack.id]
    );

    if (!recipients.length) {
      return res.status(200).json({ success: true, total: 0, sent: 0, failed: 0, errors: [] });
    }

    // Fetch first prop to compose conversation starter text
    const { rows: props } = await query(
      `SELECT prop_short, prop_summary, prop_side_a_short, prop_side_b_short
         FROM props
        WHERE pack_id = $1
        ORDER BY COALESCE(prop_order, 0) ASC, created_at ASC
        LIMIT 1`,
      [pack.id]
    );
    if (!props.length) {
      return res.status(400).json({ success: false, error: 'No props found in this pack' });
    }
    const p = props[0];
    const line = (p.prop_short || p.prop_summary || '').trim();
    const a = (p.prop_side_a_short || 'A').trim();
    const b = (p.prop_side_b_short || 'B').trim();
    const body = `Pack: ${pack.title}\n1/1 ${line}\nReply A) ${a} or B) ${b}`;

    let sent = 0;
    let failed = 0;
    const errors = [];
    for (const r of recipients) {
      try {
        await sendSMS({ to: r.phone, message: body });
        sent += 1;
      } catch (e) {
        failed += 1;
        try { errors.push({ to: r.phone, error: e?.message || String(e) }); } catch {}
      }
    }

    return res.status(200).json({ success: true, total: recipients.length, sent, failed, errors });
  } catch (error) {
    console.error('[admin/packs/[packId]/send-convo-starter] error =>', error);
    return res.status(500).json({ success: false, error: 'Failed to send convo starter' });
  }
}


