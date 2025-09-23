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
  await query(`CREATE TABLE IF NOT EXISTS players (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    league TEXT NOT NULL,
    source_player_id TEXT,
    full_name TEXT NOT NULL,
    first_name TEXT,
    last_name TEXT,
    position TEXT,
    team_abv TEXT,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await query(`CREATE INDEX IF NOT EXISTS players_league_team_abv ON players(league, team_abv)`);
  await query(`CREATE UNIQUE INDEX IF NOT EXISTS players_unique_source ON players(league, source_player_id) WHERE source_player_id IS NOT NULL`);
  await query(`ALTER TABLE players ADD COLUMN IF NOT EXISTS headshot_url TEXT`);

  const resp = await fetch(url);
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`NFL boxscore fetch failed: ${resp.status} ${text.slice(0, 200)}`);
  }
  const json = await resp.json();
  const map = json?.normalized?.playersById || {};
  const entries = Object.entries(map);

  const toParts = (name) => {
    const s = String(name || '').trim();
    if (!s) return { first: null, last: null };
    const parts = s.split(/\s+/);
    return { first: parts[0] || null, last: parts.slice(1).join(' ') || null };
  };

  let inserted = 0;
  for (const [id, p] of entries) {
    const { first, last } = toParts(p.longName || '');
    const headshot = /^\d+$/.test(String(id)) ? `https://a.espncdn.com/combiner/i?img=/i/headshots/nfl/players/full/${id}.png` : null;
    const res = await query(
      `INSERT INTO players (league, source_player_id, full_name, first_name, last_name, position, team_abv, headshot_url, active)
       VALUES ('nfl',$1,$2,$3,$4,$5,$6,$7,true)
       ON CONFLICT (league, source_player_id) WHERE source_player_id IS NOT NULL
       DO UPDATE SET full_name = EXCLUDED.full_name, first_name = EXCLUDED.first_name, last_name = EXCLUDED.last_name, position = EXCLUDED.position, team_abv = EXCLUDED.team_abv, headshot_url = COALESCE(EXCLUDED.headshot_url, players.headshot_url), updated_at = NOW()
       RETURNING id`,
      [String(id), p.longName || String(id), first, last, p.pos || null, p.teamAbv || null, headshot]
    );
    if (res?.rows?.[0]?.id) inserted += 1;
  }

  console.log(`[import-nfl-players-from-boxscore] eventId=${eventId} upserted=${inserted}`);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});


