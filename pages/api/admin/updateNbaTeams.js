import { getToken } from "next-auth/jwt";
import { query } from '../../../lib/db/postgres';
import { getDataBackend } from '../../../lib/runtimeConfig';

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) {
    return res.status(401).json({ success: false, error: "Unauthorized" });
  }

  try {
    const backend = getDataBackend();
    if (backend !== 'postgres' || !process.env.DATABASE_URL) {
      return res.status(400).json({ success: false, error: 'Postgres backend required for NBA teams update' });
    }

    // Ensure composite unique constraints to avoid cross-league collisions
    try {
      await query(`
        DO $$
        BEGIN
          IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'teams_team_id_key') THEN
            ALTER TABLE teams DROP CONSTRAINT teams_team_id_key;
          END IF;
          IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'teams_team_slug_key') THEN
            ALTER TABLE teams DROP CONSTRAINT teams_team_slug_key;
          END IF;
          IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'uniq_teams_league_team_id') THEN
            BEGIN
              DROP INDEX IF EXISTS uniq_teams_league_team_id;
            EXCEPTION WHEN others THEN
              NULL;
            END;
          END IF;
          IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'uniq_teams_league_team_slug') THEN
            BEGIN
              DROP INDEX IF EXISTS uniq_teams_league_team_slug;
            EXCEPTION WHEN others THEN
              NULL;
            END;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uniq_teams_league_team_id') THEN
            ALTER TABLE teams ADD CONSTRAINT uniq_teams_league_team_id UNIQUE (league, team_id);
          END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uniq_teams_league_team_slug') THEN
            ALTER TABLE teams ADD CONSTRAINT uniq_teams_league_team_slug UNIQUE (league, team_slug);
          END IF;
        END $$;
      `);
    } catch (e) {
      try { console.warn('[updateNbaTeams] Constraint/index ensure warning:', e.message); } catch {}
    }

    // Fetch NBA teams from ESPN API
    const url = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams";
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`ESPN API responded with status ${response.status}`);
    }
    const data = await response.json();
    const teams = data.sports?.[0]?.leagues?.[0]?.teams || [];
    let processedCount = 0;

    for (const item of teams) {
      const teamInfo = item.team || item;
      const teamID = String(teamInfo.id || '');
      const teamName = String(teamInfo.name || teamInfo.displayName || '');
      const teamLogoURL = teamInfo.logos?.[0]?.href || null;
      const teamAbbreviation = String(teamInfo.abbreviation || '').toUpperCase();
      const shortName = String(teamInfo.shortDisplayName || teamAbbreviation || '').trim();

      if (!teamID || !teamName) continue;

      await query(
        `INSERT INTO teams (team_id, team_slug, name, league, logo_url, short_name)
         VALUES ($1,$2,$3,'nba',$4,$5)
         ON CONFLICT (league, team_id) DO UPDATE SET
           team_slug = COALESCE(EXCLUDED.team_slug, teams.team_slug),
           name = COALESCE(EXCLUDED.name, teams.name),
           logo_url = COALESCE(EXCLUDED.logo_url, teams.logo_url),
           short_name = COALESCE(EXCLUDED.short_name, teams.short_name)`,
        [teamID, teamAbbreviation, teamName, teamLogoURL, shortName]
      );

      if (teamAbbreviation) {
        await query(
          `UPDATE teams SET team_slug = $1 WHERE league = 'nba' AND team_id = $2 AND (team_slug IS NULL OR team_slug = '')`,
          [teamAbbreviation, teamID]
        );
      }

      processedCount++;
    }

    return res.status(200).json({ success: true, processedCount });
  } catch (error) {
    console.error("[admin/updateNbaTeams] Error:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
} 