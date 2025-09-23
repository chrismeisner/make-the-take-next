import { query } from '../../db/postgres';

export class PostgresPlayersRepository {
  async ensureSchema() {
    try { await query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`); } catch {}
    await query(
      `CREATE TABLE IF NOT EXISTS players (
         id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
         league TEXT NOT NULL,
         source_player_id TEXT,
         full_name TEXT NOT NULL,
         first_name TEXT,
         last_name TEXT,
         position TEXT,
         team_abv TEXT,
         headshot_url TEXT,
         team_row_id UUID,
         active BOOLEAN NOT NULL DEFAULT TRUE,
         created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
         updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
       )`
    );
    await query(`CREATE INDEX IF NOT EXISTS players_league_team_abv ON players(league, team_abv)`);
    await query(`CREATE UNIQUE INDEX IF NOT EXISTS players_unique_source ON players(league, source_player_id) WHERE source_player_id IS NOT NULL`);
    // Backfill new columns if added after initial creation
    await query(`ALTER TABLE players ADD COLUMN IF NOT EXISTS headshot_url TEXT`);
    await query(`ALTER TABLE players ADD COLUMN IF NOT EXISTS team_row_id UUID`);
    await query(`CREATE INDEX IF NOT EXISTS players_team_row_id_idx ON players(team_row_id)`);
    // Add FK only if it doesn't already exist to avoid noisy errors in logs
    await query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
            FROM pg_constraint c
            JOIN pg_class t ON t.oid = c.conrelid
           WHERE c.conname = 'players_team_fk'
             AND t.relname = 'players'
        ) THEN
          ALTER TABLE players
            ADD CONSTRAINT players_team_fk
            FOREIGN KEY (team_row_id)
            REFERENCES teams(id);
        END IF;
      END $$;
    `);
  }

  async upsertMany(items) {
    if (!Array.isArray(items) || !items.length) return 0;
    let n = 0;
    for (const p of items) {
      const { league, source_player_id, full_name, first_name = null, last_name = null, position = null, team_abv = null } = p;
      // Derive ESPN headshot URL when possible
      const leagueSlug = String(league || '').toLowerCase() === 'major-mlb' ? 'mlb' : String(league || '').toLowerCase();
      const isNumericId = /^\d+$/.test(String(source_player_id || ''));
      const headshot = p.headshot_url || (isNumericId && leagueSlug ? `https://a.espncdn.com/combiner/i?img=/i/headshots/${leagueSlug}/players/full/${source_player_id}.png` : null);
      const res = await query(
        `INSERT INTO players (league, source_player_id, full_name, first_name, last_name, position, team_abv, headshot_url, active)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,TRUE)
           ON CONFLICT (league, source_player_id) WHERE source_player_id IS NOT NULL
           DO UPDATE SET full_name = EXCLUDED.full_name, first_name = EXCLUDED.first_name, last_name = EXCLUDED.last_name, position = EXCLUDED.position, team_abv = EXCLUDED.team_abv, headshot_url = COALESCE(EXCLUDED.headshot_url, players.headshot_url), updated_at = NOW()
           RETURNING id`,
        [league, source_player_id || null, full_name, first_name, last_name, position, team_abv, headshot]
      );
      if (res?.rows?.[0]?.id) n += 1;
      // Link to teams table by abbreviation or team_slug within same league
      try {
        await query(
          `UPDATE players p
              SET team_row_id = t.id, updated_at = NOW()
             FROM teams t
            WHERE p.id = $1
              AND t.league = p.league
              AND (
                   UPPER(COALESCE(t.abbreviation, '')) = UPPER(COALESCE(p.team_abv, ''))
                OR UPPER(COALESCE(t.team_slug, '')) = UPPER(COALESCE(p.team_abv, ''))
              )`,
          [res?.rows?.[0]?.id]
        );
      } catch {}
    }
    return n;
  }

  async listByLeagueAndTeams(league, teamAbvs = []) {
    const { rows } = await query(
      `SELECT 
          source_player_id        AS id,
          full_name               AS "longName",
          first_name              AS "firstName",
          last_name               AS "lastName",
          position                AS pos,
          team_abv                AS "teamAbv",
          headshot_url            AS "headshotUrl",
          league                  AS league,
          team_row_id             AS "teamRowId"
         FROM players
        WHERE active = TRUE
          AND ($1::text IS NULL OR league = $1)
          AND (COALESCE($2::text[], ARRAY[]::text[]) = ARRAY[]::text[] OR team_abv = ANY($2::text[]))
        ORDER BY full_name`,
      [league || null, teamAbvs.length ? teamAbvs : null]
    );
    return rows;
  }
}


