#!/usr/bin/env node
import 'dotenv/config';
import pgPkg from 'pg';
const { Pool } = pgPkg;

async function main() {
  const eventId = process.argv[2] || '401772731';
  const baseUrl = process.env.MTT_BASE_URL || 'http://localhost:3000';
  const url = `${baseUrl}/api/admin/api-tester/boxscore?source=nfl&gameID=${encodeURIComponent(eventId)}`;

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: /amazonaws\.com|render|heroku|neon|timescale/i.test(String(process.env.DATABASE_URL || '')) ? { rejectUnauthorized: false } : undefined,
  });
  const query = (text, params) => pool.query(text, params);
  // Ensure schema
  await query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
  await query(`CREATE TABLE IF NOT EXISTS stat_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    league TEXT NOT NULL,
    entity TEXT NOT NULL,
    scope TEXT NOT NULL,
    key TEXT NOT NULL,
    label TEXT NOT NULL,
    description TEXT,
    source_key JSONB DEFAULT '{}'::jsonb,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await query(`CREATE UNIQUE INDEX IF NOT EXISTS stat_metrics_unique ON stat_metrics(league, entity, scope, key) WHERE active`);

  // Fetch NFL boxscore from local API (requires dev server running and RapidAPI env configured)
  const resp = await fetch(url);
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`Boxscore fetch failed: ${resp.status} ${text.slice(0, 200)}`);
  }
  const json = await resp.json();

  // Derive team metric keys from teams[].statistics[].name and include 'points'
  const teams = Array.isArray(json?.data?.teams) ? json.data.teams : [];
  const keys = new Set();
  for (const t of teams) {
    const stats = Array.isArray(t?.statistics) ? t.statistics : [];
    for (const s of stats) {
      const name = String(s?.name || '').trim();
      if (name) keys.add(name);
    }
  }
  keys.add('points');

  const toLabel = (k) => {
    try {
      const spaced = String(k).replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_\-]+/g, ' ');
      return spaced.replace(/\b\w/g, (c) => c.toUpperCase());
    } catch { return String(k); }
  };

  const items = Array.from(keys).map((key) => ({ key, label: toLabel(key) }));
  let inserted = 0;
  for (const m of items) {
    const res = await query(
      `INSERT INTO stat_metrics (league, entity, scope, key, label, active)
       VALUES ('nfl','team','single',$1,$2,true)
       ON CONFLICT (league, entity, scope, key) WHERE active
       DO UPDATE SET label = EXCLUDED.label, updated_at = NOW()
       RETURNING id`,
      [m.key, m.label]
    );
    if (res?.rows?.[0]?.id) inserted += 1;
  }
  console.log(`[import-metrics-from-nfl-boxscore] eventId=${eventId} upserted=${inserted}`);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});


