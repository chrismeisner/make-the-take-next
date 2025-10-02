// scripts/run-pack-status.js
// Run the same pack status transitions as the admin API, for cron use.

const { Pool } = require('pg');
const twilio = require('twilio');

function shouldUseSsl(connectionString) {
  try {
    if (process.env.NODE_ENV === 'production') return true;
    if (process.env.PGSSLMODE) return true;
    if (/\bsslmode=/i.test(connectionString || '')) return true;
    if (/amazonaws\.com/i.test(connectionString || '')) return true;
  } catch {}
  return false;
}

function createPool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('⛔️ [pack-status] Missing DATABASE_URL');
  }
  const pool = new Pool({
    connectionString,
    ssl: shouldUseSsl(connectionString) ? { rejectUnauthorized: false } : undefined,
    max: Number.parseInt(process.env.PG_POOL_MAX || '5', 10),
    idleTimeoutMillis: Number.parseInt(process.env.PG_IDLE_TIMEOUT_MS || '30000', 10),
    connectionTimeoutMillis: Number.parseInt(process.env.PG_CONN_TIMEOUT_MS || '30000', 10),
    keepAlive: true,
  });
  // Apply safe server-side limits on connect (best-effort)
  try {
    const stmtMs = Number.parseInt(process.env.PG_STATEMENT_TIMEOUT_MS || '8000', 10);
    const idleXactMs = Number.parseInt(process.env.PG_IDLE_IN_XACT_TIMEOUT_MS || '5000', 10);
    const lockMs = Number.parseInt(process.env.PG_LOCK_TIMEOUT_MS || '5000', 10);
    const appName = (process.env.PG_APP_NAME || 'make-the-take-cron').replace(/'/g, "''");
    pool.on('connect', (client) => {
      const tasks = [];
      if (Number.isFinite(stmtMs) && stmtMs > 0) tasks.push(client.query(`SET statement_timeout TO ${stmtMs}`));
      if (Number.isFinite(idleXactMs) && idleXactMs > 0) tasks.push(client.query(`SET idle_in_transaction_session_timeout TO ${idleXactMs}`));
      if (Number.isFinite(lockMs) && lockMs > 0) tasks.push(client.query(`SET lock_timeout TO ${lockMs}`));
      tasks.push(client.query(`SET application_name TO '${appName}'`));
      Promise.allSettled(tasks).catch(() => {});
    });
  } catch {}
  return pool;
}

const pool = createPool();

// Initialize Twilio client
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// Dry run toggle (no DB updates, no SMS; API calls pass dryRun)
const DRY_RUN = (() => {
  const v = String(process.env.CRON_DRY_RUN || '').toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
})();

async function query(text, params) {
  return pool.query(text, params);
}

// Lightweight audit logger for admin events
async function auditLog({ eventKey, severity = 'info', source = 'cron:run-pack-status', packId = null, packUrl = null, propId = null, eventId = null, profileId = null, message = null, details = null }) {
  try {
    await query(
      `INSERT INTO admin_event_audit_log (
         event_key, severity, source, pack_id, pack_url, prop_id, event_id, profile_id, message, details
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        String(eventKey || 'unknown'),
        String(severity || 'info'),
        String(source || 'cron:run-pack-status'),
        packId || null,
        packUrl || null,
        propId || null,
        eventId || null,
        profileId || null,
        message || null,
        details ? JSON.stringify(details) : null,
      ]
    );
  } catch (_) {
    // swallow audit errors
  }
}

async function sendSMS({ to, message }) {
  const useFrom = (process.env.TWILIO_FROM_NUMBER || '').trim();
  const useService = (process.env.TWILIO_MESSAGING_SERVICE_SID || '').trim();
  if (!useFrom && !useService) {
    console.error("[twilioService] Twilio sender not configured. Set TWILIO_FROM_NUMBER or TWILIO_MESSAGING_SERVICE_SID.");
    throw new Error("Twilio sender not configured");
  }
  try {
    const params = { body: String(message || ''), to: String(to || '').trim() };
    if (useService) params.messagingServiceSid = useService; else params.from = useFrom;
    console.log("[twilioService] Sending SMS", { to: params.to, using: useService ? 'messagingServiceSid' : 'from' });
    const msg = await twilioClient.messages.create(params);
    return msg;
  } catch (error) {
    console.error("[twilioService] Error sending SMS to", to, error?.message || error);
    throw error;
  }
}

async function createOutboxWithRecipients(message, profileIds) {
  try {
    const { rows } = await query(
      `INSERT INTO outbox (message, status) VALUES ($1, 'ready') RETURNING id`,
      [message]
    );
    const outboxId = rows[0]?.id;
    if (!outboxId) return null;
    if (Array.isArray(profileIds) && profileIds.length > 0) {
      const values = [];
      for (let i = 0; i < profileIds.length; i++) {
        values.push(`($1, $${i + 2})`);
      }
      await query(
        `INSERT INTO outbox_recipients (outbox_id, profile_id) VALUES ${values.join(', ')}`,
        [outboxId, ...profileIds]
      );
    }
    return outboxId;
  } catch (err) {
    console.error('[pack-status] Error creating outbox message:', err?.message || err);
    return null;
  }
}

async function calculatePackRankings(packId) {
  try {
    // Get all takes for this pack with their points
    const { rows } = await query(
      `SELECT t.take_mobile, t.take_pts, t.take_result
       FROM takes t
       WHERE t.pack_id = $1
         AND t.take_status = 'latest'
         AND t.take_mobile IS NOT NULL`,
      [packId]
    );
    
    if (!rows || rows.length === 0) {
      return new Map();
    }
    
    // Group by phone number and sum points
    const userStats = new Map();
    for (const row of rows) {
      const phone = row.take_mobile;
      if (!userStats.has(phone)) {
        userStats.set(phone, { phone, totalPoints: 0, wins: 0, losses: 0, pushes: 0 });
      }
      const stats = userStats.get(phone);
      stats.totalPoints += Number(row.take_pts || 0);
      
      const result = String(row.take_result || '').toLowerCase();
      if (result === 'won') stats.wins += 1;
      else if (result === 'lost') stats.losses += 1;
      else if (result === 'push' || result === 'pushed') stats.pushes += 1;
    }
    
    // Sort by total points (descending) and assign rankings
    const sortedUsers = Array.from(userStats.values()).sort((a, b) => b.totalPoints - a.totalPoints);
    
    const rankings = new Map();
    let currentRank = 1;
    let previousPoints = null;
    
    for (let i = 0; i < sortedUsers.length; i++) {
      const user = sortedUsers[i];
      
      // If this user has different points than the previous user, update the rank
      if (previousPoints !== null && user.totalPoints < previousPoints) {
        currentRank = i + 1;
      }
      
      rankings.set(user.phone, {
        rank: currentRank,
        totalPoints: user.totalPoints,
        wins: user.wins,
        losses: user.losses,
        pushes: user.pushes,
        totalParticipants: sortedUsers.length
      });
      
      previousPoints = user.totalPoints;
    }
    
    return rankings;
  } catch (error) {
    console.error(`[pack-status] Error calculating rankings for pack ${packId}:`, error);
    return new Map();
  }
}

function formatRankingMessage(ranking, packUrl) {
  const { rank, totalPoints, totalParticipants, wins, losses, pushes } = ranking;
  
  // Create ordinal suffix (1st, 2nd, 3rd, 4th, etc.)
  const getOrdinalSuffix = (num) => {
    const lastDigit = num % 10;
    const lastTwoDigits = num % 100;
    
    if (lastTwoDigits >= 11 && lastTwoDigits <= 13) return 'th';
    if (lastDigit === 1) return 'st';
    if (lastDigit === 2) return 'nd';
    if (lastDigit === 3) return 'rd';
    return 'th';
  };
  
  const ordinalRank = `${rank}${getOrdinalSuffix(rank)}`;
  
  // Build the message with ranking info
  let message = `🎉 Your pack "${packUrl}" has been graded! `;
  
  if (totalParticipants === 1) {
    message += `You're the only participant! `;
  } else {
    message += `You finished ${ordinalRank} out of ${totalParticipants} participants! `;
  }
  
  message += `(${totalPoints} pts, ${wins}W-${losses}L`;
  if (pushes > 0) message += `-${pushes}P`;
  message += `) `;
  
  const siteUrl = process.env.SITE_URL || 'https://makethetake.com';
  message += `View results: ${siteUrl}/packs/${packUrl}`;
  
  return message;
}

async function run() {
  const backend = String(process.env.DATA_BACKEND || 'postgres').toLowerCase();
  if (backend !== 'postgres') {
    console.error('⛔️ [pack-status] DATA_BACKEND must be postgres');
    process.exitCode = 2;
    return;
  }

  try {
    console.log('🚀 [pack-status] START', { when: new Date().toISOString(), backend: 'postgres' });

    // Step 0: Close Props whose close_time has passed
    const propCloseSql = `
      UPDATE props
         SET prop_status = 'closed', updated_at = NOW()
       WHERE LOWER(COALESCE(prop_status, '')) = 'open'
         AND close_time IS NOT NULL
         AND NOW() > close_time
      RETURNING id::text, pack_id::text`;

    const propCloseStart = Date.now();
    const { rows: propsClosed } = await query(propCloseSql);
    const propCloseMs = Date.now() - propCloseStart;
    console.log('🔒 [prop-status] CLOSED (from open)', { durationMs: propCloseMs, closedCount: (propsClosed || []).length });
    try { await auditLog({ eventKey: 'props_closed', message: 'Closed open props past close_time', details: { closedCount: (propsClosed || []).length, durationMs: propCloseMs } }); } catch {}

    const openSql = `
      UPDATE packs
         SET pack_status = 'open'
       WHERE (pack_open_time IS NOT NULL AND LENGTH(TRIM(pack_open_time::text)) > 0)
         AND NOW() >= (pack_open_time::timestamptz)
         AND (
               pack_close_time IS NULL
            OR LENGTH(TRIM(pack_close_time::text)) = 0
            OR NOW() < (pack_close_time::timestamptz)
         )
         AND LOWER(COALESCE(pack_status, '')) = 'coming-soon'
      RETURNING id, pack_url`;

    const openStart = Date.now();
    const { rows: opened } = await query(openSql);
    const openMs = Date.now() - openStart;
    console.log('🟢 [pack-status] OPEN (from coming-soon)', { durationMs: openMs, openCount: opened.length, sample: opened.slice(0, 10).map(r => r.pack_url) });
    try { if (opened.length) await auditLog({ eventKey: 'packs_opened', message: 'Packs transitioned to open', details: { count: opened.length, sample: opened.slice(0,5).map(r=>r.pack_url), durationMs: openMs } }); } catch {}

    // Send SMS notifications for newly opened packs
    if (opened.length > 0) {
      console.log('📱 [pack-status] Sending SMS notifications for opened packs...');
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

          // Render template with variables (absolute URL)
          const site = (process.env.SITE_URL || 'https://makethetake.com').replace(/\/$/, '');
          const packPath = `/packs/${packInfo.pack_url || packInfo.pack_id}`;
          const packUrl = `${site}${packPath}`;
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
            console.log(`📱 [pack-status] No SMS recipients for pack ${packInfo.pack_url} (league: ${league})`);
            continue;
          }
          
          // Create outbox entry and recipients
          const profileIds = recRows.map(r => r.profile_id);
          const outboxId = await createOutboxWithRecipients(message, profileIds);

          // Send SMS to each recipient
          let sentCount = 0;
          for (const recipient of recRows) {
            try {
              await sendSMS({ to: recipient.phone, message });
              sentCount++;
            } catch (smsErr) {
              console.error(`[pack-status] SMS send error for ${recipient.phone}:`, smsErr);
            }
          }

          // Update outbox status based on outcome
          if (outboxId) {
            try {
              const allSent = sentCount === recRows.length;
              await query(`UPDATE outbox SET status = $2 WHERE id = $1`, [outboxId, allSent ? 'sent' : 'error']);
            } catch (e) {
              console.error(`[pack-status] Failed updating outbox status for ${outboxId}:`, e?.message || e);
            }
          }

          if (sentCount > 0) {
            console.log(`📱 [pack-status] Sent ${sentCount} SMS notifications for opened pack: ${packInfo.pack_url}`);
          }
        } catch (err) {
          console.error(`[pack-status] Error sending SMS notifications for pack ${pack.pack_url}:`, err);
        }
      }
    }

    const closeSql = `
      UPDATE packs
         SET pack_status = 'live'
       WHERE (pack_close_time IS NOT NULL AND LENGTH(TRIM(pack_close_time::text)) > 0)
         AND NOW() >= (pack_close_time::timestamptz)
         AND LOWER(COALESCE(pack_status, '')) IN ('open','active')
      RETURNING id, pack_url`;

    const closeStart = Date.now();
    const { rows: closed } = await query(closeSql);
    const closeMs = Date.now() - closeStart;
    console.log('🔴 [pack-status] LIVE (from open/active)', { durationMs: closeMs, liveCount: closed.length, sample: closed.slice(0, 10).map(r => r.pack_url) });
    try { if (closed.length) await auditLog({ eventKey: 'packs_went_live', message: 'Packs moved to live (close reached)', details: { count: closed.length, sample: closed.slice(0,5).map(r=>r.pack_url), durationMs: closeMs } }); } catch {}

    // Step 3: live → pending-grade when ESPN reports the linked event(s) are complete
    async function getEspnPathForLeague(league) {
      try {
        const lg = String(league || '').toLowerCase();
        if (lg === 'mlb' || lg.includes('baseball')) return 'baseball/mlb';
        if (lg === 'nfl' || lg.includes('football')) return 'football/nfl';
        if (lg === 'nba' || lg.includes('basketball')) return 'basketball/nba';
        if (lg === 'nhl' || lg.includes('hockey')) return 'hockey/nhl';
      } catch {}
      return null;
    }

    async function fetchEspnGameCompleted(league, espnGameID) {
      try {
        const pathLeague = await getEspnPathForLeague(league);
        if (!pathLeague || !espnGameID) return null;
        const url = `https://site.api.espn.com/apis/site/v2/sports/${pathLeague}/summary?event=${encodeURIComponent(espnGameID)}`;
        const resp = await fetch(url, { headers: { Accept: 'application/json' } });
        if (!resp.ok) return null;
        const data = await resp.json();
        const type = data?.header?.competitions?.[0]?.status?.type || {};
        const state = String(type.state || type.name || '').toLowerCase();
        const detail = String(type.detail || type.description || '').toLowerCase();
        const completed = Boolean(type.completed) || state === 'post' || state === 'final' || /final/.test(detail);
        return { completed, state: type.state || type.name || '', detail: type.detail || type.description || '' };
      } catch {
        return null;
      }
    }

    async function findLivePacksReadyForGrading() {
      // Find packs that are live and have one or more linked events with espn ids
      const sql = `
        WITH live_packs AS (
          SELECT id, pack_url, event_id
            FROM packs
           WHERE LOWER(COALESCE(pack_status, '')) = 'live'
        ),
        direct_events AS (
          SELECT lp.id AS pack_id, lp.pack_url, e.espn_game_id, e.league
            FROM live_packs lp
            JOIN events e ON e.id = lp.event_id
           WHERE e.espn_game_id IS NOT NULL
        ),
        m2m_events AS (
          SELECT p.id AS pack_id, p.pack_url, e.espn_game_id, e.league
            FROM packs p
            JOIN live_packs lp ON lp.id = p.id
            JOIN packs_events pe ON pe.pack_id = p.id
            JOIN events e ON e.id = pe.event_id
           WHERE e.espn_game_id IS NOT NULL
        ),
        all_events AS (
          SELECT * FROM direct_events
          UNION
          SELECT * FROM m2m_events
        )
        SELECT pack_id, pack_url, espn_game_id, league
          FROM all_events
      `;
      const { rows } = await query(sql);
      if (!rows || rows.length === 0) {
        return { readyPackIds: [], byPackSize: 0 };
      }

      // Group events by pack
      const byPack = new Map();
      for (const r of rows) {
        if (!byPack.has(r.pack_id)) byPack.set(r.pack_id, { packUrl: r.pack_url, events: [] });
        const pack = byPack.get(r.pack_id);
        // Deduplicate by espn id
        if (!pack.events.some(ev => ev.espn_game_id === r.espn_game_id)) {
          pack.events.push({ espn_game_id: r.espn_game_id, league: r.league });
        }
      }

      // Fetch ESPN status for each pack's events
      const packsReady = [];
      const entries = Array.from(byPack.entries());
      const concurrency = Math.max(2, Math.min(8, Number.parseInt(process.env.CRON_HTTP_CONCURRENCY || '6', 10)));
      let idx = 0;
      async function worker() {
        while (true) {
          const current = idx++;
          if (current >= entries.length) break;
          const [packId, info] = entries[current];
          const checks = await Promise.all(
            info.events.map(ev => fetchEspnGameCompleted(ev.league, ev.espn_game_id))
          );
          const allKnown = checks.filter(Boolean);
          if (allKnown.length === 0) continue;
          const allCompleted = allKnown.length === info.events.length && allKnown.every(s => s.completed === true);
          if (allCompleted) packsReady.push({ id: packId, packUrl: info.packUrl });
        }
      }
      const workers = [];
      for (let i = 0; i < concurrency; i++) workers.push(worker());
      await Promise.all(workers);

      const unique = [];
      const seen = new Set();
      for (const p of packsReady) {
        if (seen.has(p.id)) continue; seen.add(p.id); unique.push(p);
      }
      return { readyPackIds: unique, byPackSize: byPack.size };
    }

    async function gradeAutoPropsForPack(pack) {
      const baseUrl = (process.env.SITE_URL || 'http://localhost:3000').replace(/\/$/, '');
      const httpConcurrency = Math.max(2, Math.min(8, Number.parseInt(process.env.CRON_HTTP_CONCURRENCY || '6', 10)));
      const packId = typeof pack === 'string' ? pack : pack.id;
      const packUrl = typeof pack === 'string' ? undefined : pack.packUrl;

      // Load props for this pack
      const { rows: props } = await query(
        `SELECT id::text AS id, prop_status, grading_mode, formula_key
           FROM props
          WHERE pack_id = $1`,
        [packId]
      );
      const targets = (props || []).filter((p) => {
        const mode = String(p.grading_mode || '').toLowerCase();
        const status = String(p.prop_status || '').toLowerCase();
        const isTerminal = status === 'gradeda' || status === 'gradedb' || status === 'push';
        return mode === 'auto' && !isTerminal;
      });

      let propsGraded = 0;
      let idx = 0;
      async function worker() {
        while (true) {
          const current = idx++;
          if (current >= targets.length) break;
          const prop = targets[current];
          try {
            const resp = await fetch(`${baseUrl}/api/admin/gradePropByFormula`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
              body: JSON.stringify({ airtableId: prop.id, dryRun: false }),
            });
            let json = null; try { json = await resp.json(); } catch {}
            if (resp.ok && json && json.success) {
              propsGraded++;
              try {
                await auditLog({
                  eventKey: 'prop_grade_success',
                  severity: 'info',
                  source: 'cron:run-pack-status',
                  packId,
                  packUrl: packUrl || null,
                  propId: prop.id,
                  message: 'Prop graded via cron',
                  details: { status: resp.status, response: json }
                });
              } catch {}
            } else {
              try {
                await auditLog({
                  eventKey: 'prop_grade_failure',
                  severity: 'warn',
                  source: 'cron:run-pack-status',
                  packId,
                  packUrl: packUrl || null,
                  propId: prop.id,
                  message: (json && json.error) ? String(json.error) : `HTTP ${resp.status}`,
                  details: { status: resp.status, response: json }
                });
              } catch {}
            }
          } catch {}
        }
      }
      const workers = []; for (let i = 0; i < httpConcurrency; i++) workers.push(worker());
      await Promise.all(workers);

      // Check remaining ungraded props
      const { rows: counts } = await query(
        `SELECT COUNT(*) FILTER (WHERE LOWER(COALESCE(prop_status,'')) NOT IN ('gradeda','gradedb','push'))::int AS ungraded
           FROM props
          WHERE pack_id = $1`,
        [packId]
      );
      const ungraded = counts && counts[0] ? Number(counts[0].ungraded) : NaN;
      return { packId, packUrl, propsConsidered: targets.length, propsGraded, ungraded: Number.isFinite(ungraded) ? ungraded : null };
    }

    async function processLiveReadyPacks() {
      const started = Date.now();
      const { readyPackIds, byPackSize } = await findLivePacksReadyForGrading();
      if (!readyPackIds || readyPackIds.length === 0) {
        console.log('🟠 [pack-status] LIVE→GRADE scan (none ready)', { checkedPacks: byPackSize });
        return { checkedPacks: byPackSize, immediateGraded: [], immediatePending: [], propsGraded: 0 };
      }

      // Concurrency control for packs
      const packConcurrency = Math.max(2, Math.min(4, Number.parseInt(process.env.CRON_PACK_CONCURRENCY || '3', 10)));
      let idx = 0;
      const results = [];
      async function worker() {
        while (true) {
          const current = idx++;
          if (current >= readyPackIds.length) break;
          const pack = readyPackIds[current];
          const res = await gradeAutoPropsForPack(pack);
          results.push(res);
        }
      }
      const workers = []; for (let i = 0; i < packConcurrency; i++) workers.push(worker());
      await Promise.all(workers);

      // Split by final state and update in batches
      const toGraded = results.filter(r => (r.ungraded === 0)).map(r => r.packId);
      const toPending = results.filter(r => (r.ungraded > 0)).map(r => r.packId);
      if (toGraded.length > 0) {
        await query(`UPDATE packs SET pack_status = 'graded' WHERE id = ANY($1::uuid[]) AND LOWER(COALESCE(pack_status,'')) IN ('live','pending-grade')`, [toGraded]);
        
        // Send SMS notifications for newly graded packs
        try {
          const { rows: packInfo } = await query(
            `SELECT id, pack_url FROM packs WHERE id = ANY($1::uuid[])`,
            [toGraded]
          );
          
          for (const pack of packInfo) {
            try {
              // Calculate rankings for this pack
              const rankings = await calculatePackRankings(pack.id);
              
              const { rows: tr } = await query(
                `SELECT DISTINCT take_mobile
                   FROM takes
                  WHERE pack_id = $1
                    AND take_status = 'latest'
                    AND take_mobile IS NOT NULL`,
                [pack.id]
              );
              const phones = (tr || []).map(r => r.take_mobile).filter(Boolean);
              const urlPart = pack.pack_url || '';
              
              for (const to of phones) {
                try {
                  const ranking = rankings.get(to);
                  let message;
                  
                  if (ranking) {
                    message = formatRankingMessage(ranking, urlPart);
                  } else {
                    // Fallback to simple message if ranking calculation failed
                    const siteUrl = process.env.SITE_URL || 'https://makethetake.com';
                    message = `🎉 Your pack "${urlPart}" has been graded! View results: ${siteUrl}/packs/${urlPart}`;
                  }
                  
                  await sendSMS({ to, message });
                } catch (smsErr) {
                  console.error(`[pack-status] SMS send error for ${to}:`, smsErr);
                }
              }
              if (phones.length > 0) {
                console.log(`📱 [pack-status] Sent ${phones.length} SMS notifications for graded pack: ${urlPart}`);
              }
            } catch (smsErr) {
              console.error(`[pack-status] Error sending SMS notifications for pack ${pack.id}:`, smsErr);
            }
          }
        } catch (smsErr) {
          console.error(`[pack-status] Error processing SMS notifications for graded packs:`, smsErr);
        }
      }
      if (toPending.length > 0) {
        await query(`UPDATE packs SET pack_status = 'pending-grade' WHERE id = ANY($1::uuid[]) AND LOWER(COALESCE(pack_status,'')) = 'live'`, [toPending]);
      }

      const elapsed = Date.now() - started;
      const propsGraded = results.reduce((acc, r) => acc + (r.propsGraded || 0), 0);
      console.log('🧪 [pack-status] LIVE ready → graded/pending', {
        durationMs: elapsed,
        checkedPacks: byPackSize,
        readyCount: readyPackIds.length,
        immediateGradedCount: toGraded.length,
        immediatePendingCount: toPending.length,
        propsGraded,
        sampleGraded: results.filter(r => r.ungraded === 0).slice(0, 5).map(r => r.packUrl).filter(Boolean),
        samplePending: results.filter(r => r.ungraded > 0).slice(0, 5).map(r => r.packUrl).filter(Boolean),
      });
      return { checkedPacks: byPackSize, immediateGraded: toGraded, immediatePending: toPending, propsGraded };
    }

    const liveProcessStart = Date.now();
    const liveAgg = await processLiveReadyPacks();
    const liveProcessMs = Date.now() - liveProcessStart;
      console.log('🟠 [pack-status] LIVE processed for immediate grading', { durationMs: liveProcessMs, ...liveAgg });
      try { await auditLog({ eventKey: 'live_scan_results', message: 'Scanned live packs ready for grading', details: { durationMs: liveProcessMs, ...liveAgg } }); } catch {}

    // Step 4: For packs in pending-grade, auto-grade their auto props via API
    async function gradePropsForPendingPacks() {
      // Prefer SITE_URL; fallback to VERCEL_URL; finally localhost
      const resolvedBase = (() => {
        const site = (process.env.SITE_URL || '').trim();
        if (site) return site.replace(/\/$/, '');
        const vercel = (process.env.VERCEL_URL || '').trim();
        if (vercel) return (vercel.startsWith('http') ? vercel : `https://${vercel}`).replace(/\/$/, '');
        return 'http://localhost:3000';
      })();
      const baseUrl = resolvedBase;
      const httpConcurrency = Math.max(2, Math.min(8, Number.parseInt(process.env.CRON_HTTP_CONCURRENCY || '6', 10)));
      const logSample = (arr, mapFn) => (arr || []).slice(0, 10).map(mapFn);

      // Fetch all packs in pending-grade
      const { rows: packs } = await query(
        `SELECT id, pack_url
           FROM packs
          WHERE LOWER(COALESCE(pack_status,'')) = 'pending-grade'`
      );
      if (!packs || packs.length === 0) {
        return { packsScanned: 0, propsConsidered: 0, propsGraded: 0, gradedPacks: [] };
      }

      let propsConsidered = 0;
      let propsGraded = 0;
      const gradedPacks = [];

      for (const pack of packs) {
        // Get props for this pack
        const { rows: props } = await query(
          `SELECT id::text AS id, prop_status, grading_mode, formula_key
             FROM props
            WHERE pack_id = $1`,
          [pack.id]
        );
        const targets = (props || []).filter((p) => {
          const status = String(p.prop_status || '').toLowerCase();
          const hasFormula = String(p.formula_key || '').trim().length > 0;
          const isTerminal = status === 'gradeda' || status === 'gradedb' || status === 'push';
          // Default: grade any non-terminal prop with a formula
          return !isTerminal && hasFormula;
        });
        propsConsidered += targets.length;

        // Concurrency-limited grading via API
        let idx = 0;
        async function worker() {
          while (true) {
            const current = idx++;
            if (current >= targets.length) break;
            const prop = targets[current];
            try {
              const resp = await fetch(`${baseUrl}/api/admin/gradePropByFormula`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                body: JSON.stringify({ airtableId: prop.id, dryRun: false }),
              });
              let json = null;
              try { json = await resp.json(); } catch {}
              // 409/404 are acceptable (not ready or not found) → skip and retry next run
              if (resp.ok && json && json.success) {
                propsGraded++;
                try {
                  await auditLog({
                    eventKey: 'prop_grade_success',
                    severity: 'info',
                    source: 'cron:run-pack-status',
                    packId: pack.id,
                    packUrl: pack.pack_url || null,
                    propId: prop.id,
                    message: 'Prop graded via cron (pending-grade set)',
                    details: { status: resp.status, response: json }
                  });
                } catch {}
              } else {
                try {
                  await auditLog({
                    eventKey: 'prop_grade_failure',
                    severity: 'warn',
                    source: 'cron:run-pack-status',
                    packId: pack.id,
                    packUrl: pack.pack_url || null,
                    propId: prop.id,
                    message: (json && json.error) ? String(json.error) : `HTTP ${resp.status}`,
                    details: { status: resp.status, response: json }
                  });
                } catch {}
              }
            } catch (e) {
              // swallow and continue; will retry on next run
            }
          }
        }
        const workers = [];
        for (let i = 0; i < httpConcurrency; i++) workers.push(worker());
        await Promise.all(workers);

        // If all props are now terminal, mark pack graded and send SMS notifications
        try {
          const { rows: counts } = await query(
            `SELECT
               COUNT(*) FILTER (WHERE LOWER(COALESCE(prop_status,'')) NOT IN ('gradeda','gradedb','push'))::int AS ungraded
               , COUNT(*)::int AS total
             FROM props
            WHERE pack_id = $1`,
            [pack.id]
          );
          const ungraded = counts && counts[0] ? Number(counts[0].ungraded) : NaN;
          if (Number.isFinite(ungraded) && ungraded === 0) {
            await query(`UPDATE packs SET pack_status = 'graded' WHERE id = $1`, [pack.id]);
            gradedPacks.push(pack.pack_url);
            
            // Send SMS notifications to all participants
            try {
              // Calculate rankings for this pack
              const rankings = await calculatePackRankings(pack.id);
              
              const { rows: tr } = await query(
                `SELECT DISTINCT take_mobile
                   FROM takes
                  WHERE pack_id = $1
                    AND take_status = 'latest'
                    AND take_mobile IS NOT NULL`,
                [pack.id]
              );
              const phones = (tr || []).map(r => r.take_mobile).filter(Boolean);
              const urlPart = pack.pack_url || '';
              
              for (const to of phones) {
                try {
                  const ranking = rankings.get(to);
                  let message;
                  
                  if (ranking) {
                    message = formatRankingMessage(ranking, urlPart);
                  } else {
                    // Fallback to simple message if ranking calculation failed
                    const siteUrl = process.env.SITE_URL || 'https://makethetake.com';
                    message = `🎉 Your pack "${urlPart}" has been graded! View results: ${siteUrl}/packs/${urlPart}`;
                  }
                  
                  await sendSMS({ to, message });
                } catch (smsErr) {
                  console.error(`[pack-status] SMS send error for ${to}:`, smsErr);
                }
              }
              if (phones.length > 0) {
                console.log(`📱 [pack-status] Sent ${phones.length} SMS notifications for graded pack: ${urlPart}`);
              }
            } catch (smsErr) {
              console.error(`[pack-status] Error sending SMS notifications for pack ${pack.id}:`, smsErr);
            }
          }
        } catch {}
      }

      console.log('🧪 [pack-status] AUTO-GRADE pending-grade packs', {
        packsScanned: packs.length,
        propsConsidered,
        propsGraded,
        gradedPacksSample: logSample(gradedPacks, (u) => u),
      });
      return { packsScanned: packs.length, propsConsidered, propsGraded, gradedPacks };
    }

    const pendingGradeStart = Date.now();
    const agg = await gradePropsForPendingPacks();
    const pendingGradeMs = Date.now() - pendingGradeStart;
    console.log('🧮 [pack-status] PENDING-GRADE processed', { durationMs: pendingGradeMs, ...agg });
    try { await auditLog({ eventKey: 'pending_grade_processed', message: 'Processed pending-grade packs auto-grading', details: { durationMs: pendingGradeMs, ...agg } }); } catch {}

    // Step 5: closed → graded when no props remain open for the pack
    const gradeSql = `
      UPDATE packs p
         SET pack_status = 'graded'
       WHERE LOWER(COALESCE(p.pack_status, '')) = 'closed'
         AND NOT EXISTS (
               SELECT 1 FROM props pr
                WHERE pr.pack_id = p.id
                  AND LOWER(COALESCE(pr.prop_status, '')) = 'open'
             )
      RETURNING p.id, p.pack_url`;

    const gradeStart = Date.now();
    const { rows: graded } = await query(gradeSql);
    const gradeMs = Date.now() - gradeStart;
    
    // Send SMS notifications for newly graded packs (from closed status)
    if (graded && graded.length > 0) {
      for (const pack of graded) {
        try {
          // Calculate rankings for this pack
          const rankings = await calculatePackRankings(pack.id);
          
          const { rows: tr } = await query(
            `SELECT DISTINCT take_mobile
               FROM takes
              WHERE pack_id = $1
                AND take_status = 'latest'
                AND take_mobile IS NOT NULL`,
            [pack.id]
          );
          const phones = (tr || []).map(r => r.take_mobile).filter(Boolean);
          const urlPart = pack.pack_url || '';
          
          for (const to of phones) {
            try {
              const ranking = rankings.get(to);
              let message;
              
              if (ranking) {
                message = formatRankingMessage(ranking, urlPart);
              } else {
                // Fallback to simple message if ranking calculation failed
                const siteUrl = process.env.SITE_URL || 'https://makethetake.com';
                message = `🎉 Your pack "${urlPart}" has been graded! View results: ${siteUrl}/packs/${urlPart}`;
              }
              
              await sendSMS({ to, message });
            } catch (smsErr) {
              console.error(`[pack-status] SMS send error for ${to}:`, smsErr);
            }
          }
          if (phones.length > 0) {
            console.log(`📱 [pack-status] Sent ${phones.length} SMS notifications for graded pack: ${urlPart}`);
          }
        } catch (smsErr) {
          console.error(`[pack-status] Error sending SMS notifications for pack ${pack.id}:`, smsErr);
        }
      }
    }
    
    console.log('🟣 [pack-status] GRADED (from closed)', { durationMs: gradeMs, gradedCount: graded.length, sample: graded.slice(0, 10).map(r => r.pack_url) });
    try { if (graded.length) await auditLog({ eventKey: 'packs_graded', message: 'Packs marked graded (from closed)', details: { durationMs: gradeMs, count: graded.length, sample: graded.slice(0,5).map(r=>r.pack_url) } }); } catch {}

    console.log('✅ [pack-status] DONE', {
      propsClosed: (propsClosed || []).length,
      openedToOpen: opened.length,
      openToLive: closed.length,
      liveImmediateGraded: (liveAgg?.immediateGraded || []).length,
      liveImmediatePending: (liveAgg?.immediatePending || []).length,
      pendingPacksScanned: agg?.packsScanned || 0,
      pendingPropsGraded: agg?.propsGraded || 0,
      closedToGraded: graded.length,
      totalDurationMs: propCloseMs + openMs + closeMs + liveProcessMs + gradeMs
    });
  } catch (err) {
    console.error('❌ [pack-status] ERROR', { message: err?.message, stack: err?.stack });
    try { await auditLog({ eventKey: 'cron_error', severity: 'error', message: err?.message || String(err) }); } catch {}
    process.exitCode = 1;
  } finally {
    try { await pool.end(); } catch {}
  }
}

run();


