#!/usr/bin/env node
import 'dotenv/config';
import pgPkg from 'pg';
const { Pool } = pgPkg;

async function main() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: /amazonaws\.com|render|heroku|neon|timescale/i.test(String(process.env.DATABASE_URL || '')) ? { rejectUnauthorized: false } : undefined,
  });
  const query = (text, params) => pool.query(text, params);

  // Ensure column exists
  await query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
  await query(`ALTER TABLE players ADD COLUMN IF NOT EXISTS headshot_url TEXT`);

  // Backfill NFL
  const nfl = await query(
    `UPDATE players
        SET headshot_url = CONCAT('https://a.espncdn.com/combiner/i?img=/i/headshots/nfl/players/full/', source_player_id, '.png'),
            updated_at = NOW()
      WHERE league = 'nfl'
        AND headshot_url IS NULL
        AND source_player_id ~ '^\\d+$'`
  );

  // Backfill MLB (league stored as 'major-mlb')
  const mlb = await query(
    `UPDATE players
        SET headshot_url = CONCAT('https://a.espncdn.com/combiner/i?img=/i/headshots/mlb/players/full/', source_player_id, '.png'),
            updated_at = NOW()
      WHERE league = 'major-mlb'
        AND headshot_url IS NULL
        AND source_player_id ~ '^\\d+$'`
  );

  console.log(`[backfill-player-headshots] nfl_updated=${nfl.rowCount} mlb_updated=${mlb.rowCount}`);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});


