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
    console.log('🟢 [pack-status] OPEN', { durationMs: openMs, openedCount: opened.length, sample: opened.slice(0, 10).map(r => r.pack_url) });

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
    console.log('🔴 [pack-status] LIVE', { durationMs: closeMs, liveCount: closed.length, sample: closed.slice(0, 10).map(r => r.pack_url) });

    console.log('✅ [pack-status] DONE', { opened: opened.length, live: closed.length, totalDurationMs: openMs + closeMs });
  } catch (err) {
    console.error('❌ [pack-status] ERROR', { message: err?.message, stack: err?.stack });
    process.exitCode = 1;
  } finally {
    try { await pool.end(); } catch {}
  }
}

run();


