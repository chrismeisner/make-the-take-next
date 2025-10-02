// scripts/migrate-admin-event-audit-log.mjs
// Create the admin_event_audit_log table and indexes idempotently

import { Pool } from 'pg';

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('Missing DATABASE_URL');
    process.exit(2);
    return;
  }
  const pool = new Pool({
    connectionString,
    ssl: /amazonaws\.com/i.test(connectionString) || process.env.PGSSLMODE ? { rejectUnauthorized: false } : undefined,
    max: 2,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 15000,
  });
  try {
    console.log('[migrate] Connecting…');
    const client = await pool.connect();
    try {
      console.log('[migrate] Running DDL…');
      await client.query(`
        CREATE EXTENSION IF NOT EXISTS pgcrypto;

        CREATE TABLE IF NOT EXISTS admin_event_audit_log (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          event_key TEXT NOT NULL,
          severity TEXT NOT NULL DEFAULT 'info',
          source TEXT,
          pack_id UUID,
          pack_url TEXT,
          prop_id UUID,
          event_id UUID,
          profile_id UUID,
          message TEXT,
          details JSONB
        );

        CREATE INDEX IF NOT EXISTS idx_admin_event_audit_log_created ON admin_event_audit_log (created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_admin_event_audit_log_event_key ON admin_event_audit_log (event_key);
        CREATE INDEX IF NOT EXISTS idx_admin_event_audit_log_pack ON admin_event_audit_log (pack_id);
      `);
      console.log('[migrate] Done.');
    } finally {
      client.release();
    }
  } catch (e) {
    console.error('[migrate] ERROR:', e?.message || e);
    process.exitCode = 1;
  } finally {
    try { await pool.end(); } catch {}
  }
}

main();


