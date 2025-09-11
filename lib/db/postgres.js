// lib/db/postgres.js
// Minimal Postgres connection (node-postgres Pool)

import { Pool } from 'pg';

// Use a global singleton so Next.js dev hot-reloads and per-route bundles
// all share one pool instead of re-initializing repeatedly.
const globalAny = /** @type {any} */ (globalThis);
if (!globalAny.__MTT_PG_POOL__) {
  globalAny.__MTT_PG_POOL__ = null;
  globalAny.__MTT_PG_INIT_LOGGED__ = false;
}

export function getPgPool() {
  if (!globalAny.__MTT_PG_POOL__) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('[postgres] Missing DATABASE_URL');
    }
    const isProd = process.env.NODE_ENV === 'production';
    const shouldUseSsl = (() => {
      if (isProd) return true;
      const url = connectionString || '';
      if (process.env.PGSSLMODE) return true;
      if (/\bsslmode=/i.test(url)) return true;
      if (/amazonaws\.com/i.test(url)) return true; // common for Heroku PG
      return false;
    })();
    // Optional: log once at startup
    if (!globalAny.__MTT_PG_INIT_LOGGED__) {
      try {
        // eslint-disable-next-line no-console
        console.log('[postgres] Initializing pool', { env: process.env.NODE_ENV, ssl: shouldUseSsl ? 'on' : 'off' });
      } catch {}
      globalAny.__MTT_PG_INIT_LOGGED__ = true;
    }
    globalAny.__MTT_PG_POOL__ = new Pool({
      connectionString,
      ssl: shouldUseSsl ? { rejectUnauthorized: false } : undefined,
      max: Number.parseInt(process.env.PG_POOL_MAX || '10', 10),
      idleTimeoutMillis: Number.parseInt(process.env.PG_IDLE_TIMEOUT_MS || '30000', 10),
      connectionTimeoutMillis: Number.parseInt(process.env.PG_CONN_TIMEOUT_MS || '30000', 10),
      keepAlive: true,
    });
  }
  return globalAny.__MTT_PG_POOL__;
}

export async function query(text, params) {
  const client = getPgPool();
  const startNs = (typeof process !== 'undefined' && process.hrtime && process.hrtime.bigint)
    ? process.hrtime.bigint()
    : null;
  const startMs = startNs ? null : Date.now();
  try {
    const result = await client.query(text, params);
    const endNs = startNs ? process.hrtime.bigint() : null;
    const durationMs = startNs
      ? Number(endNs - startNs) / 1e6
      : (Date.now() - startMs);
    const slowMs = Number.parseInt(process.env.PG_SLOW_MS || '300', 10);
    const sqlSnippet = (() => {
      try {
        const s = String(text || '').replace(/\s+/g, ' ').trim();
        return s.length > 160 ? s.slice(0, 157) + '…' : s;
      } catch {
        return '[sql]';
      }
    })();
    try {
      const rowCount = (result && typeof result.rowCount === 'number') ? result.rowCount : (result?.rows?.length || 0);
      const msg = `[postgres] ${durationMs.toFixed(1)}ms · rows=${rowCount} · ${sqlSnippet}`;
      // eslint-disable-next-line no-console
      if (Number.isFinite(durationMs) && durationMs >= slowMs) console.warn(msg);
      else console.log(msg);
    } catch {}
    return result;
  } catch (err) {
    const endNs = startNs ? process.hrtime.bigint() : null;
    const durationMs = startNs
      ? Number(endNs - startNs) / 1e6
      : (Date.now() - startMs);
    try {
      const sqlSnippet = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 160);
      // eslint-disable-next-line no-console
      console.error(`[postgres] ERROR after ${durationMs.toFixed(1)}ms · ${sqlSnippet}`, err?.message || err);
    } catch {}
    throw err;
  }
}


