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

  await query(`ALTER TABLE players ADD COLUMN IF NOT EXISTS team_row_id UUID`);
  await query(`CREATE INDEX IF NOT EXISTS players_team_row_id_idx ON players(team_row_id)`);
  try { await query(`ALTER TABLE players ADD CONSTRAINT players_team_fk FOREIGN KEY (team_row_id) REFERENCES teams(id)`); } catch {}

  const res = await query(
    `UPDATE players p
        SET team_row_id = t.id, updated_at = NOW()
       FROM teams t
      WHERE p.team_row_id IS NULL
        AND t.league = p.league
        AND (
             UPPER(COALESCE(t.abbreviation, '')) = UPPER(COALESCE(p.team_abv, ''))
          OR UPPER(COALESCE(t.team_slug, '')) = UPPER(COALESCE(p.team_abv, ''))
        )`
  );

  console.log(`[link-players-to-teams] linked=${res.rowCount}`);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});


