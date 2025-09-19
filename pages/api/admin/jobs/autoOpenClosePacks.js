import { query } from '../../../../lib/db/postgres';
import { sendSMS } from '../../../../lib/twilioService';

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

    // Send SMS notifications for newly opened packs
    if (opened.length > 0) {
      console.log('📱 [autoOpenClosePacks] Sending SMS notifications for opened packs...');
      for (const pack of opened) {
        try {
          // Get pack details including league for SMS targeting
          const { rows: packDetails } = await query(
            `SELECT id, pack_id, pack_url, title, league FROM packs WHERE id = $1 LIMIT 1`,
            [pack.id]
          );
          
          if (packDetails.length === 0) continue;
          const packInfo = packDetails[0];
          const league = (packInfo.league || '').toLowerCase();

          // Resolve SMS rule/template for this league
          const { rows: ruleRows } = await query(
            `SELECT template FROM sms_rules WHERE trigger_type = 'pack_open' AND active = TRUE AND (league = $1 OR league IS NULL) ORDER BY league NULLS LAST, updated_at DESC LIMIT 1`,
            [league]
          );
          const template = ruleRows.length ? ruleRows[0].template : 'Pack {packTitle} is open! {packUrl}';
          
          // Render template with variables
          const packUrl = `/packs/${packInfo.pack_url || packInfo.pack_id}`;
          const message = template
            .replace(/{packTitle}/g, packInfo.title || 'New Pack')
            .replace(/{packUrl}/g, packUrl)
            .replace(/{league}/g, league);

          // Find recipients who opted in for this league
          const { rows: recRows } = await query(
            `SELECT p.id AS profile_id, p.mobile_e164 AS phone
               FROM profiles p
               JOIN notification_preferences np ON np.profile_id = p.id
              WHERE COALESCE(p.sms_opt_out_all, FALSE) = FALSE
                AND np.category = 'pack_open'
                AND np.league = $1
                AND np.opted_in = TRUE
                AND p.mobile_e164 IS NOT NULL`,
            [league]
          );

          if (recRows.length === 0) {
            console.log(`📱 [autoOpenClosePacks] No SMS recipients for pack ${packInfo.pack_url} (league: ${league})`);
            continue;
          }

          // Send SMS to each recipient
          let sentCount = 0;
          for (const recipient of recRows) {
            try {
              await sendSMS({ to: recipient.phone, message });
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





