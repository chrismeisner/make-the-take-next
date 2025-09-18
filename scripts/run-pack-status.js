// scripts/run-pack-status.js
// Run the same pack status transitions as the admin API, for cron use.

const { Pool } = require('pg');

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

async function query(text, params) {
  return pool.query(text, params);
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

    async function promoteLivePacksToPendingGrade() {
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
        return { updated: [], checkedPacks: 0 };
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
      // Concurrency control
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
          // If we couldn't fetch any statuses, skip this pack for now
          if (allKnown.length === 0) continue;
          const allCompleted = allKnown.length === info.events.length && allKnown.every(s => s.completed === true);
          if (allCompleted) packsReady.push(packId);
        }
      }
      const workers = [];
      for (let i = 0; i < concurrency; i++) workers.push(worker());
      await Promise.all(workers);

      // Update all ready packs in a single statement
      const uniqueIds = Array.from(new Set(packsReady));
      if (uniqueIds.length === 0) return { updated: [], checkedPacks: byPack.size };
      const { rows: updated } = await query(
        `UPDATE packs
            SET pack_status = 'pending-grade'
          WHERE id = ANY($1::uuid[])
            AND LOWER(COALESCE(pack_status, '')) = 'live'
        RETURNING id, pack_url`,
        [uniqueIds]
      );
      return { updated, checkedPacks: byPack.size };
    }

    const liveToPendingStart = Date.now();
    const { updated: pendingRows, checkedPacks } = await promoteLivePacksToPendingGrade();
    const liveToPendingMs = Date.now() - liveToPendingStart;
    console.log('🟠 [pack-status] PENDING-GRADE (from live)', { durationMs: liveToPendingMs, checkedPacks, promotedCount: (pendingRows || []).length, sample: (pendingRows || []).slice(0, 10).map(r => r.pack_url) });

    // Step 4: closed → graded when no props remain open for the pack
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
    console.log('🟣 [pack-status] GRADED (from closed)', { durationMs: gradeMs, gradedCount: graded.length, sample: graded.slice(0, 10).map(r => r.pack_url) });

    console.log('✅ [pack-status] DONE', { openedToOpen: opened.length, openToLive: closed.length, liveToPending: (pendingRows || []).length, closedToGraded: graded.length, totalDurationMs: openMs + closeMs + liveToPendingMs + gradeMs });
  } catch (err) {
    console.error('❌ [pack-status] ERROR', { message: err?.message, stack: err?.stack });
    process.exitCode = 1;
  } finally {
    try { await pool.end(); } catch {}
  }
}

run();


