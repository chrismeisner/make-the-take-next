import { getToken } from 'next-auth/jwt';
import { query } from '../../../lib/db/postgres';
import { sendSMS } from '../../../lib/twilioService';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token || !token.superAdmin) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  const backend = String(process.env.DATA_BACKEND || 'postgres').toLowerCase();
  if (backend !== 'postgres') {
    return res.status(400).json({ success: false, error: 'DATA_BACKEND must be postgres to run this job' });
  }

  try {
    try {
      console.log('[runPackStatus] START', {
        backend,
        nowIso: new Date().toISOString(),
        user: { profileID: token?.profileID || null, superAdmin: Boolean(token?.superAdmin) }
      });
    } catch {}

    const openSql = `
      UPDATE packs
         SET pack_status = 'active'
       WHERE (pack_open_time IS NOT NULL AND LENGTH(TRIM(pack_open_time::text)) > 0)
         AND NOW() >= (pack_open_time::timestamptz)
         AND (
               pack_close_time IS NULL
            OR LENGTH(TRIM(pack_close_time::text)) = 0
            OR NOW() < (pack_close_time::timestamptz)
         )
         AND COALESCE(LOWER(pack_status), '') NOT IN ('active','closed','graded','completed')
      RETURNING id, pack_url`;
    const openStart = Date.now();
    const { rows: opened } = await query(openSql);
    const openMs = Date.now() - openStart;
    try {
      console.log('[runPackStatus] OPEN phase complete', {
        durationMs: openMs,
        openedCount: opened.length,
        openedPreview: opened.slice(0, 10).map((r) => r.pack_url)
      });
    } catch {}

    // Send SMS notifications for newly opened packs
    if (opened.length > 0) {
      console.log('📱 [runPackStatus] Sending SMS notifications for opened packs...');
      for (const pack of opened) {
        try {
          // Get pack details including league for SMS targeting
          const { rows: packDetails } = await query(
            `SELECT id, pack_id, pack_url, title, league, pack_open_sms_template, pack_close_time FROM packs WHERE id = $1 LIMIT 1`,
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
          const template = packInfo.pack_open_sms_template || (ruleRows.length ? ruleRows[0].template : '{packTitle} is open; {timeLeft} to make your takes {packUrl}');
          
          // Render template with variables
          const packUrl = `/packs/${packInfo.pack_url || packInfo.pack_id}`;
          // Compute timeLeft if close time exists
          const humanizeTimeDelta = (toTs) => {
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
          };
          const timeLeft = packInfo.pack_close_time ? humanizeTimeDelta(packInfo.pack_close_time) : 'now';
          const message = template
            .replace(/{packTitle}/g, packInfo.title || 'New Pack')
            .replace(/{packUrl}/g, packUrl)
            .replace(/{league}/g, league)
            .replace(/{timeLeft}/g, timeLeft);

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
            console.log(`📱 [runPackStatus] No SMS recipients for pack ${packInfo.pack_url} (league: ${league})`);
            continue;
          }

          // Send SMS to each recipient
          let sentCount = 0;
          for (const recipient of recRows) {
            try {
              await sendSMS({ to: recipient.phone, message });
              sentCount++;
            } catch (smsErr) {
              console.error(`[runPackStatus] SMS send error for ${recipient.phone}:`, smsErr);
            }
          }

          if (sentCount > 0) {
            console.log(`📱 [runPackStatus] Sent ${sentCount} SMS notifications for opened pack: ${packInfo.pack_url}`);
          }
        } catch (err) {
          console.error(`[runPackStatus] Error sending SMS notifications for pack ${pack.pack_url}:`, err);
        }
      }
    }

    const closeSql = `
      UPDATE packs
         SET pack_status = 'live'
       WHERE (pack_close_time IS NOT NULL AND LENGTH(TRIM(pack_close_time::text)) > 0)
         AND NOW() >= (pack_close_time::timestamptz)
         AND COALESCE(LOWER(pack_status), '') NOT IN ('live','graded','completed')
      RETURNING id, pack_url`;
    const closeStart = Date.now();
    const { rows: closed } = await query(closeSql);
    const closeMs = Date.now() - closeStart;
    try {
      console.log('[runPackStatus] LIVE phase complete', {
        durationMs: closeMs,
        liveCount: closed.length,
        livePreview: closed.slice(0, 10).map((r) => r.pack_url)
      });
    } catch {}

    try {
      console.log('[runPackStatus] DONE', {
        opened: opened.length,
        live: closed.length,
        totalDurationMs: undefined
      });
    } catch {}

    return res.status(200).json({ success: true, openedCount: opened.length, liveCount: closed.length });
  } catch (error) {
    try {
      console.error('[runPackStatus] ERROR', { message: error?.message, stack: error?.stack });
    } catch {}
    return res.status(500).json({ success: false, error: error.message });
  }
}


