#!/usr/bin/env node
/* eslint-disable no-console */
require('dotenv/config');
const { Pool } = require('pg');

const items = [
  // MLB player single (curated)
  { league: 'mlb', entity: 'player', scope: 'single', key: 'R', label: 'Runs', source_key: { mlb: { boxscoreKey: 'R', aliases: ['runs'] } } },
  { league: 'mlb', entity: 'player', scope: 'single', key: 'H', label: 'Hits', source_key: { mlb: { boxscoreKey: 'H', aliases: ['hits'] } } },
  { league: 'mlb', entity: 'player', scope: 'single', key: 'RBI', label: 'RBI', source_key: { mlb: { boxscoreKey: 'RBI', aliases: ['rbi', 'RBIs'] } } },
  { league: 'mlb', entity: 'player', scope: 'single', key: 'HR', label: 'Home Runs', source_key: { mlb: { boxscoreKey: 'HR', aliases: ['homeRuns', 'homeruns', 'home_runs'] } } },
  { league: 'mlb', entity: 'player', scope: 'single', key: 'SB', label: 'Stolen Bases', source_key: { mlb: { boxscoreKey: 'SB', aliases: ['stolenBases', 'stolen_bases'] } } },
  { league: 'mlb', entity: 'player', scope: 'single', key: 'SO', label: 'Strikeouts', source_key: { mlb: { boxscoreKey: 'SO', aliases: ['strikeouts', 'k', 'K'] } } },
  { league: 'mlb', entity: 'player', scope: 'single', key: 'BB', label: 'Walks', source_key: { mlb: { boxscoreKey: 'BB', aliases: ['walks', 'baseOnBalls', 'base_on_balls'] } } },
  { league: 'mlb', entity: 'player', scope: 'single', key: 'TB', label: 'Total Bases', source_key: { mlb: { boxscoreKey: 'TB', aliases: ['totalBases', 'total_bases'] } } },
  { league: 'mlb', entity: 'player', scope: 'single', key: '2B', label: 'Doubles', source_key: { mlb: { boxscoreKey: '2B', aliases: ['doubles'] } } },
  { league: 'mlb', entity: 'player', scope: 'single', key: '3B', label: 'Triples', source_key: { mlb: { boxscoreKey: '3B', aliases: ['triples'] } } },
  { league: 'mlb', entity: 'player', scope: 'single', key: 'AB', label: 'At Bats', source_key: { mlb: { boxscoreKey: 'AB', aliases: ['atBats', 'at_bats'] } } },
  { league: 'mlb', entity: 'player', scope: 'single', key: 'AVG', label: 'Batting Average', source_key: { mlb: { boxscoreKey: 'AVG', aliases: ['avg'] } } },
  { league: 'mlb', entity: 'player', scope: 'single', key: 'OBP', label: 'On-Base %', source_key: { mlb: { boxscoreKey: 'OBP', aliases: ['onBasePct', 'obp', 'on_base_percentage'] } } },
  { league: 'mlb', entity: 'player', scope: 'single', key: 'SLG', label: 'Slugging %', source_key: { mlb: { boxscoreKey: 'SLG', aliases: ['sluggingPct', 'slugAvg', 'slg'] } } },
  { league: 'mlb', entity: 'player', scope: 'single', key: 'OPS', label: 'OPS', source_key: { mlb: { boxscoreKey: 'OPS', aliases: ['ops'] } } },

  // MLB player multi (allow same keys)
  { league: 'mlb', entity: 'player', scope: 'multi', key: 'H', label: 'Hits', source_key: { mlb: { boxscoreKey: 'H', aliases: ['hits'] } } },
  { league: 'mlb', entity: 'player', scope: 'multi', key: 'RBI', label: 'RBI', source_key: { mlb: { boxscoreKey: 'RBI', aliases: ['rbi', 'RBIs'] } } },
  { league: 'mlb', entity: 'player', scope: 'multi', key: 'HR', label: 'Home Runs', source_key: { mlb: { boxscoreKey: 'HR', aliases: ['homeRuns', 'homeruns', 'home_runs'] } } },
  { league: 'mlb', entity: 'player', scope: 'multi', key: 'SB', label: 'Stolen Bases', source_key: { mlb: { boxscoreKey: 'SB', aliases: ['stolenBases', 'stolen_bases'] } } },
  { league: 'mlb', entity: 'player', scope: 'multi', key: 'SO', label: 'Strikeouts', source_key: { mlb: { boxscoreKey: 'SO', aliases: ['strikeouts', 'k', 'K'] } } },
  { league: 'mlb', entity: 'player', scope: 'multi', key: 'BB', label: 'Walks', source_key: { mlb: { boxscoreKey: 'BB', aliases: ['walks', 'baseOnBalls', 'base_on_balls'] } } },
  { league: 'mlb', entity: 'player', scope: 'multi', key: 'TB', label: 'Total Bases', source_key: { mlb: { boxscoreKey: 'TB', aliases: ['totalBases', 'total_bases'] } } },
  { league: 'mlb', entity: 'player', scope: 'multi', key: '2B', label: 'Doubles', source_key: { mlb: { boxscoreKey: '2B', aliases: ['doubles'] } } },
  { league: 'mlb', entity: 'player', scope: 'multi', key: '3B', label: 'Triples', source_key: { mlb: { boxscoreKey: '3B', aliases: ['triples'] } } },

  // MLB team single
  { league: 'mlb', entity: 'team', scope: 'single', key: 'R', label: 'Runs', source_key: { mlb: { boxscoreKey: 'R', aliases: [] } } },
  { league: 'mlb', entity: 'team', scope: 'single', key: 'H', label: 'Hits', source_key: { mlb: { boxscoreKey: 'H', aliases: [] } } },
  { league: 'mlb', entity: 'team', scope: 'single', key: 'E', label: 'Errors', source_key: { mlb: { boxscoreKey: 'E', aliases: [] } } },

  // MLB team multi
  { league: 'mlb', entity: 'team', scope: 'multi', key: 'R', label: 'Runs', source_key: { mlb: { boxscoreKey: 'R', aliases: [] } } },
  { league: 'mlb', entity: 'team', scope: 'multi', key: 'H', label: 'Hits', source_key: { mlb: { boxscoreKey: 'H', aliases: [] } } },
  { league: 'mlb', entity: 'team', scope: 'multi', key: 'E', label: 'Errors', source_key: { mlb: { boxscoreKey: 'E', aliases: [] } } },
];

async function ensureSchema(client) {
  await client.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
  await client.query(`
    CREATE TABLE IF NOT EXISTS stat_metrics (
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
    );
  `);
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS stat_metrics_unique
      ON stat_metrics(league, entity, scope, key)
      WHERE active;
  `);
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('Missing DATABASE_URL');
  const useSsl = /amazonaws\.com|sslmode=/.test(connectionString) || process.env.PGSSLMODE;
  const pool = new Pool({ connectionString, ssl: useSsl ? { rejectUnauthorized: false } : undefined });
  const client = await pool.connect();
  try {
    await ensureSchema(client);
    let inserted = 0;
    for (const m of items) {
      const res = await client.query(
        `INSERT INTO stat_metrics (league, entity, scope, key, label, description, source_key, active)
           VALUES ($1,$2,$3,$4,$5,$6,$7,true)
           ON CONFLICT (league, entity, scope, key) WHERE active
           DO UPDATE SET label = EXCLUDED.label, description = EXCLUDED.description, source_key = EXCLUDED.source_key, updated_at = NOW()
           RETURNING id`,
        [m.league, m.entity, m.scope, m.key, m.label || m.key, m.description || null, JSON.stringify(m.source_key || {})]
      );
      if (res?.rows?.[0]?.id) inserted += 1;
    }
    console.log(`[seed-mlb-metrics] upserted=${inserted}`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });


