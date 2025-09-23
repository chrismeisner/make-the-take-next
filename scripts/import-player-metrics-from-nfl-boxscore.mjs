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

  const resp = await fetch(url);
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`Boxscore fetch failed: ${resp.status} ${text.slice(0, 200)}`);
  }
  const json = await resp.json();

  const normalized = json?.normalized || {};
  const keysSet = new Set(Array.isArray(normalized.statKeys) ? normalized.statKeys : []);
  try {
    const players = normalized.playersById || {};
    for (const p of Object.values(players)) {
      const stats = p?.stats || {};
      for (const k of Object.keys(stats)) keysSet.add(k);
    }
  } catch {}

  // Curated fallback if boxscore lacks keys
  if (keysSet.size === 0) {
    ['passingYards','passingCompletions','passingAttempts','rushingYards','rushingAttempts','receptions','receivingYards','passingTD','rushingTD','receivingTD','interceptions','tackles','sacks'].forEach(k => keysSet.add(k));
  }

  const toLabel = (k) => {
    try {
      const spaced = String(k).replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_\-]+/g, ' ');
      return spaced.replace(/\b\w/g, (c) => c.toUpperCase());
    } catch { return String(k); }
  };

  let inserted = 0;
  for (const key of keysSet) {
    const label = toLabel(key);
    const res = await query(
      `INSERT INTO stat_metrics (league, entity, scope, key, label, active)
       VALUES ('nfl','player','single',$1,$2,true)
       ON CONFLICT (league, entity, scope, key) WHERE active
       DO UPDATE SET label = EXCLUDED.label, updated_at = NOW()
       RETURNING id`,
      [key, label]
    );
    if (res?.rows?.[0]?.id) inserted += 1;
  }

  console.log(`[import-player-metrics-from-nfl-boxscore] eventId=${eventId} upserted=${inserted}`);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});


