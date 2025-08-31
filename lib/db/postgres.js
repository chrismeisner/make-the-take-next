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
    pool = new Pool({
      connectionString,
      ssl: isProd ? { rejectUnauthorized: false } : undefined,
      max: 10,
    });
  }
  return pool;
}

export async function query(text, params) {
  const client = getPgPool();
  return client.query(text, params);
}


