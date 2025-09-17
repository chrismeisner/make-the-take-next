// scripts/run-pack-status.js
// Run the same pack status transitions as the admin API, for cron use.

import { query, getPgPool } from '../lib/db/postgres.js';

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
    try {
      const pool = getPgPool();
      await pool.end();
    } catch {}
  }
}

run();


