import { query } from '../../../../lib/db/postgres';
import { sendSMS } from '../../../../lib/twilioService';

function humanizeTimeDelta(toTs) {
  try {
    const now = Date.now();
    const target = new Date(toTs).getTime();
    if (!Number.isFinite(target)) return '';
    let diffMs = target - now;
    if (diffMs <= 0) return 'now';
    const minutes = Math.floor(diffMs / 60000);
    const days = Math.floor(minutes / (60 * 24));
    const hours = Math.floor((minutes % (60 * 24)) / 60);
    const mins = Math.floor(minutes % 60);
    if (days >= 2) return `${days} days`;
    if (days === 1) return hours > 0 ? `1 day ${hours}h` : '1 day';
    if (hours >= 2) return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
    if (hours === 1) return mins > 0 ? `1h ${mins}m` : '1h';
    if (mins >= 1) return `${mins}m`;
    return 'soon';
  } catch { return ''; }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const providedKey = req.headers['x-cron-key'] || req.query.key;
  const expectedKey = process.env.CRON_SECRET;
  if (!expectedKey || providedKey !== expectedKey) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  // Require Postgres backend for this job
  const backend = String(process.env.DATA_BACKEND || 'airtable').toLowerCase();
  if (backend !== 'postgres') {
    return res.status(400).json({ success: false, error: 'DATA_BACKEND must be postgres to run this job' });
  }

  try {
    // Open packs when: NOW >= pack_open_time AND (no close_time OR NOW < close_time)
    const openSql = `
      UPDATE packs
         SET pack_status = 'active'
       WHERE pack_open_time IS NOT NULL
         AND NOW() >= pack_open_time
         AND (
               pack_close_time IS NULL
            OR NOW() < (pack_close_time::timestamptz)
         )
         AND COALESCE(LOWER(pack_status), '') NOT IN ('active','closed','graded','completed')
      RETURNING id, pack_url`;
    const { rows: opened } = await query(openSql);

    // Send SMS notifications or start SMS conversations for newly opened packs
    if (opened.length > 0) {
      console.log('📱 [autoOpenClosePacks] Sending SMS notifications for opened packs...');
      for (const pack of opened) {
        try {
          // Get pack details including league for SMS targeting
          const { rows: packDetails } = await query(
            `SELECT id, pack_id, pack_url, title, league, pack_open_sms_template, pack_open_time, pack_close_time, COALESCE(drop_strategy, 'link') AS drop_strategy FROM packs WHERE id = $1 LIMIT 1`,
            [pack.id]
          );
          
          if (packDetails.length === 0) continue;
          const packInfo = packDetails[0];
          const league = (packInfo.league || '').toLowerCase();

          const isConversation = String(packInfo.drop_strategy || 'link').toLowerCase() === 'sms_conversation';

          // Resolve SMS rule/template for this league
          const { rows: ruleRows } = await query(
            `SELECT template FROM sms_rules WHERE trigger_type = 'pack_open' AND active = TRUE AND (league = $1 OR league IS NULL) ORDER BY league NULLS LAST, updated_at DESC LIMIT 1`,
            [league]
          );
          const template = packInfo.pack_open_sms_template || (ruleRows.length ? ruleRows[0].template : '{packTitle} is open; {timeLeft} to make your takes {packUrl}');
          
          // Render template with variables
          const packUrl = `/packs/${packInfo.pack_url || packInfo.pack_id}`;
          const closeTs = packInfo.pack_close_time || null;
          const timeLeft = closeTs ? humanizeTimeDelta(closeTs) : 'now';
          const message = template
            .replace(/{packTitle}/g, packInfo.title || 'New Pack')
            .replace(/{packUrl}/g, packUrl)
            .replace(/{league}/g, league)
            .replace(/{timeLeft}/g, timeLeft);

          // Find recipients who opted in for this league OR any team linked to this pack
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
               SELECT p.id AS profile_id, p.mobile_e164 AS phone
                 FROM profiles p
                 JOIN notification_preferences np ON np.profile_id = p.id
                WHERE COALESCE(p.sms_opt_out_all, FALSE) = FALSE
                  AND np.category = 'pack_open'
                  AND np.league = $1
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
            [league, pack.id]
          );

          if (recRows.length === 0) {
            console.log(`📱 [autoOpenClosePacks] No SMS recipients for pack ${packInfo.pack_url} (league: ${league})`);
            continue;
          }

          // Send SMS to each recipient (link strategy) or seed sessions + first prop (conversation strategy)
          let sentCount = 0;
          for (const recipient of recRows) {
            try {
              if (!isConversation) {
                await sendSMS({ to: recipient.phone, message });
              } else {
                // Create or get session and send first prop
                // 1) Ensure a session exists
                const { rows: sessRows } = await query(
                  `WITH ins AS (
                     INSERT INTO sms_take_sessions (profile_id, phone, pack_id, current_prop_index, status)
                     SELECT $1, $2, $3, 0, 'active'
                     WHERE NOT EXISTS (
                       SELECT 1 FROM sms_take_sessions s
                        WHERE s.phone = $2 AND s.pack_id = $3 AND s.status = 'active'
                     )
                     RETURNING id
                   )
                   SELECT id FROM ins`,
                  [recipient.profile_id || null, recipient.phone, packInfo.id]
                );
                const hasSession = sessRows.length > 0;
                // 2) Fetch ordered props and send the first one
                const { rows: props } = await query(
                  `SELECT prop_id, prop_short, prop_summary, prop_side_a_short, prop_side_b_short
                     FROM props
                    WHERE pack_id = $1
                    ORDER BY COALESCE(prop_order, 0) ASC, created_at ASC
                    LIMIT 1`,
                  [packInfo.id]
                );
                if (props && props.length > 0) {
                  const p = props[0];
                  const line = (p.prop_short || p.prop_summary || '').trim();
                  const a = (p.prop_side_a_short || 'A').trim();
                  const b = (p.prop_side_b_short || 'B').trim();
                  const body = `Pack: ${packInfo.title}\n1/${1} ${line}\nReply A) ${a} or B) ${b}`;
                  await sendSMS({ to: recipient.phone, message: body });
                }
              }
              sentCount++;
            } catch (smsErr) {
              console.error(`[autoOpenClosePacks] SMS send error for ${recipient.phone}:`, smsErr);
            }
          }

          if (sentCount > 0) {
            console.log(`📱 [autoOpenClosePacks] Sent ${sentCount} SMS notifications for opened pack: ${packInfo.pack_url}`);
          }
        } catch (err) {
          console.error(`[autoOpenClosePacks] Error sending SMS notifications for pack ${pack.pack_url}:`, err);
        }
      }
    }

    // Close packs when: NOW >= pack_close_time
    const closeSql = `
      UPDATE packs
         SET pack_status = 'live'
       WHERE pack_close_time IS NOT NULL
         AND NOW() >= (pack_close_time::timestamptz)
         AND COALESCE(LOWER(pack_status), '') NOT IN ('live','graded','completed')
      RETURNING id, pack_url`;
    const { rows: closed } = await query(closeSql);

    try {
    console.log('[autoOpenClosePacks] DONE', { opened: opened.length, live: closed.length });
    } catch {}

    return res.status(200).json({ success: true, openedCount: opened.length, liveCount: closed.length });
  } catch (error) {
    try {
      console.error('[autoOpenClosePacks] ERROR', { message: error?.message });
    } catch {}
    return res.status(500).json({ success: false, error: error.message });
  }
}





