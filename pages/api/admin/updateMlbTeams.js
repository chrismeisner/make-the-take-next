import { getToken } from "next-auth/jwt";
import { query } from '../../../lib/db/postgres';
import { getDataBackend } from '../../../lib/runtimeConfig';
import { resolveSourceConfig } from '../../../lib/apiSources';

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
      return res.status(400).json({ success: false, error: 'Postgres backend required for MLB teams update' });
    }

    // Ensure correct unique constraints: unique per (league, team_id) and per (league, team_slug)
    // Drop legacy single-column uniques if they exist, then create composite UNIQUE CONSTRAINTS idempotently
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
          -- Drop prior partial unique indexes if present so we can add table constraints
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
          -- Create composite unique constraints if missing
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uniq_teams_league_team_id') THEN
            ALTER TABLE teams ADD CONSTRAINT uniq_teams_league_team_id UNIQUE (league, team_id);
          END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uniq_teams_league_team_slug') THEN
            ALTER TABLE teams ADD CONSTRAINT uniq_teams_league_team_slug UNIQUE (league, team_slug);
          END IF;
        END $$;
      `);
    } catch (e) {
      // Best-effort; continue even if index management fails
      try { console.warn('[updateMlbTeams] Constraint/index ensure warning:', e.message); } catch {}
    }

    const src = resolveSourceConfig('mlb');
    if (!src.ok) {
      return res.status(500).json({ success: false, error: 'Missing RAPIDAPI credentials for MLB' });
    }

    // Option A: if caller passes explicit teamIds, use those
    // Option B: discover from schedule for today +/- 2 days to collect active team IDs
    const body = req.body || {};
    let teamIds = Array.isArray(body.teamIds) ? body.teamIds.map(String) : [];

    async function discoverTeamIdsFromSchedule() {
      const ids = new Set();
      const baseDate = new Date();
      for (const delta of [-1, 0, 1, 2]) {
        const d = new Date(baseDate);
        d.setDate(d.getDate() + delta);
        const yyyy = String(d.getFullYear());
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        const url = new URL(`https://${src.host}${src.endpoints.schedule || src.endpoints.scoreboard}`);
        url.searchParams.set('year', yyyy);
        url.searchParams.set('month', mm);
        url.searchParams.set('day', dd);
        const resp = await fetch(url.toString(), { method: 'GET', headers: src.headers });
        if (!resp.ok) continue;
        const data = await resp.json().catch(() => ({}));
        const raw = data?.body || data || {};
        // Heuristically scan for competitors to collect team IDs
        const stack = [raw];
        while (stack.length) {
          const node = stack.pop();
          if (!node) continue;
          if (Array.isArray(node)) {
            for (const n of node) stack.push(n);
          } else if (typeof node === 'object') {
            if (Array.isArray(node.competitors)) {
              for (const c of node.competitors) {
                const id = c?.team?.id || c?.teamId || c?.id;
                if (id != null) ids.add(String(id));
              }
            }
            for (const v of Object.values(node)) stack.push(v);
          }
        }
      }
      return Array.from(ids);
    }

    if (teamIds.length === 0) {
      teamIds = await discoverTeamIdsFromSchedule();
    }
    if (teamIds.length === 0) {
      return res.status(400).json({ success: false, error: 'No MLB team IDs discovered or provided' });
    }

    let processedCount = 0;
    for (const id of teamIds) {
      try {
        const teamUrl = new URL(`https://${src.host}${src.endpoints.teamInfo}/${encodeURIComponent(String(id))}`);
        const tResp = await fetch(teamUrl.toString(), { method: 'GET', headers: src.headers });
        if (!tResp.ok) continue;
        const tData = await tResp.json().catch(() => ({}));
        const t = tData?.body || tData || {};

        const teamId = String(t?.team?.id || t?.id || id);
        const abv = String(t?.team?.abbreviation || t?.abbreviation || t?.shortDisplayName || '').toUpperCase();
        const name = String(t?.team?.displayName || t?.displayName || t?.name || '').trim();
        const logo = t?.team?.logos?.[0]?.href || t?.logos?.[0]?.href || t?.team?.logo || t?.logo || null;
        const shortName = String(t?.team?.shortDisplayName || t?.shortDisplayName || abv || '').trim();

        if (!teamId || !abv || !name) continue;

        await query(
          `INSERT INTO teams (team_id, team_slug, name, league, logo_url, short_name)
           VALUES ($1,$2,$3,'mlb',$4,$5)
           ON CONFLICT (league, team_id) DO UPDATE SET
             team_slug = COALESCE(EXCLUDED.team_slug, teams.team_slug),
             name = COALESCE(EXCLUDED.name, teams.name),
             logo_url = COALESCE(EXCLUDED.logo_url, teams.logo_url),
             short_name = COALESCE(EXCLUDED.short_name, teams.short_name)`,
          [teamId, abv, name, logo, shortName]
        );

        // Also try to ensure uniqueness on slug if present (optional secondary upsert)
        if (abv) {
          await query(
            `UPDATE teams SET team_slug = $1 WHERE league = 'mlb' AND team_id = $2 AND (team_slug IS NULL OR team_slug = '')`,
            [abv, teamId]
          );
        }

        processedCount++;
      } catch {}
    }

    return res.status(200).json({ success: true, processedCount });
  } catch (error) {
    console.error("[admin/updateMlbTeams] Error:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
} 