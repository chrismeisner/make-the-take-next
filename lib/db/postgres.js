// lib/db/postgres.js
// Minimal Postgres connection (node-postgres Pool)

import { Pool } from 'pg';

let pool;

export function getPgPool() {
  if (!pool) {
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
    try {
      // eslint-disable-next-line no-console
      console.log('[postgres] Initializing pool', { env: process.env.NODE_ENV, ssl: shouldUseSsl ? 'on' : 'off' });
    } catch {}
    pool = new Pool({
      connectionString,
      ssl: shouldUseSsl ? { rejectUnauthorized: false } : undefined,
      max: 10,
    });
  }
  return pool;
}

export async function query(text, params) {
  const client = getPgPool();
  return client.query(text, params);
}


