// Postgres-only MLB fetch via RapidAPI (major-mlb)

import { getToken } from "next-auth/jwt";
import { query } from '../../../lib/db/postgres';
import { getDataBackend } from '../../../lib/runtimeConfig';
import { resolveSourceConfig } from '../../../lib/apiSources';
import { normalizeMajorMlbScoreboard } from '../../../lib/normalize';

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
      return res.status(400).json({ success: false, error: 'Postgres backend required for MLB fetch' });
    }

    const { date, generateCovers } = req.body || {};
    const yyyymmdd = (date || new Date().toISOString().slice(0, 10)).replace(/-/g, '');
    const yyyy = String(yyyymmdd).slice(0, 4);
    const mm = String(yyyymmdd).slice(4, 6);
    const dd = String(yyyymmdd).slice(6, 8);

    const src = resolveSourceConfig('mlb');
    if (!src.ok) {
      return res.status(500).json({ success: false, error: 'Missing RAPIDAPI credentials for MLB' });
    }

    // Prefer schedule endpoint; fall back to scoreboard if needed
    let fetchUrl = new URL(`https://${src.host}${src.endpoints.schedule || src.endpoints.scoreboard}`);
    fetchUrl.searchParams.set('year', yyyy);
    fetchUrl.searchParams.set('month', mm);
    fetchUrl.searchParams.set('day', dd);
    console.log(`[admin/fetchMlbEvents] Fetching MLB schedule: ${fetchUrl.toString()}`);
    let upstream = await fetch(fetchUrl.toString(), { method: 'GET', headers: src.headers });
    if (!upstream.ok && src.endpoints.scoreboard) {
      const alt = new URL(`https://${src.host}${src.endpoints.scoreboard}`);
      alt.searchParams.set('year', yyyy);
      alt.searchParams.set('month', mm);
      alt.searchParams.set('day', dd);
      console.log(`[admin/fetchMlbEvents] Schedule failed (${upstream.status}); trying scoreboard: ${alt.toString()}`);
      upstream = await fetch(alt.toString(), { method: 'GET', headers: src.headers });
    }
    if (!upstream.ok) {
      const text = await upstream.text().catch(() => '');
      throw new Error(`RapidAPI MLB schedule failed (${upstream.status}): ${text || upstream.statusText}`);
    }
    const data = await upstream.json().catch(() => ({}));
    const raw = data?.body || data || {};
    const games = normalizeMajorMlbScoreboard(raw);
    console.log(`[admin/fetchMlbEvents] Upstream returned ${games.length} games for ${yyyy}-${mm}-${dd}`);

    let processedCount = 0;
    for (const game of games) {
      const externalId = game?.id ? String(game.id) : null;
      const eventTime = game?.gameTime || null;
      let eventTitle = `${game?.away || ''} @ ${game?.home || ''}`.trim();
      const eventLeague = 'mlb';

      const homeAbbrev = String(game?.home || '').toUpperCase();
      const awayAbbrev = String(game?.away || '').toUpperCase();
      const homeTeamIdUpstream = game?.homeTeamId ? String(game.homeTeamId) : null;
      const awayTeamIdUpstream = game?.awayTeamId ? String(game.awayTeamId) : null;
      if (!eventTitle || eventTitle === '@') {
        if (awayAbbrev && homeAbbrev) eventTitle = `${awayAbbrev} @ ${homeAbbrev}`;
      }

      let homeTeamIdPg = null;
      let awayTeamIdPg = null;
      try {
        // Prefer ESPN team_id match first, then fallback to slug
        if (homeTeamIdUpstream) {
          const { rows } = await query('SELECT id FROM teams WHERE team_id = $1 AND UPPER(league) = UPPER($2) LIMIT 1', [homeTeamIdUpstream, eventLeague]);
          homeTeamIdPg = rows?.[0]?.id || null;
        }
        if (!homeTeamIdPg && homeAbbrev) {
          const { rows } = await query('SELECT id FROM teams WHERE UPPER(team_slug) = UPPER($1) AND UPPER(league) = UPPER($2) LIMIT 1', [homeAbbrev, eventLeague]);
          homeTeamIdPg = rows?.[0]?.id || null;
        }
        if (awayTeamIdUpstream) {
          const { rows } = await query('SELECT id FROM teams WHERE team_id = $1 AND UPPER(league) = UPPER($2) LIMIT 1', [awayTeamIdUpstream, eventLeague]);
          awayTeamIdPg = rows?.[0]?.id || null;
        }
        if (!awayTeamIdPg && awayAbbrev) {
          const { rows } = await query('SELECT id FROM teams WHERE UPPER(team_slug) = UPPER($1) AND UPPER(league) = UPPER($2) LIMIT 1', [awayAbbrev, eventLeague]);
          awayTeamIdPg = rows?.[0]?.id || null;
        }
      } catch {}

      const eventIdStable = externalId || `${yyyy}${mm}${dd}-${awayAbbrev}-at-${homeAbbrev}`;

      // Upsert into Postgres using event_id as the conflict target for MLB
      // Upsert without requiring a unique constraint by attempting UPDATE first
      const updateRes = await query(
        `UPDATE events
            SET title = $2,
                league = $3,
                event_time = $4,
                home_team = COALESCE($5, home_team),
                away_team = COALESCE($6, away_team),
                home_team_id = COALESCE($7, home_team_id),
                away_team_id = COALESCE($8, away_team_id),
                espn_game_id = COALESCE($9, espn_game_id)
          WHERE event_id = $1 OR espn_game_id = $9`,
        [
          String(eventIdStable),
          eventTitle || null,
          eventLeague,
          eventTime ? new Date(eventTime) : null,
          homeAbbrev || null,
          awayAbbrev || null,
          homeTeamIdPg,
          awayTeamIdPg,
          externalId || null,
        ]
      );
      if (!updateRes || updateRes.rowCount === 0) {
        await query(
          `INSERT INTO events (event_id, espn_game_id, title, league, event_time, home_team, away_team, home_team_id, away_team_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [
            String(eventIdStable),
            externalId || null,
            eventTitle || null,
            eventLeague,
            eventTime ? new Date(eventTime) : null,
            homeAbbrev || null,
            awayAbbrev || null,
            homeTeamIdPg,
            awayTeamIdPg,
          ]
        );
      }

      processedCount++;

      // Optionally generate event cover immediately, mirroring NFL behavior
      try {
        if (generateCovers) {
          // Look up the internal numeric id for this event by the stable event_id
          const { rows: eRows } = await query('SELECT id FROM events WHERE event_id = $1 LIMIT 1', [String(eventIdStable)]);
          const internalId = eRows?.[0]?.id;
          if (internalId) {
            try {
              const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
              const path = `/api/admin/events/${internalId}/generateCover`;
              try { console.log('[admin/fetchMlbEvents] → generateCover start', { internalId, baseUrl, path }); } catch {}
              const genRes = await fetch(`${baseUrl}${path}`, { method: 'POST', headers: { Cookie: req.headers.cookie || '' } });
              let bodySnippet = null;
              let coverUrl = null;
              try {
                const txt = await genRes.text();
                bodySnippet = txt ? txt.slice(0, 200) : null;
                try { const j = txt ? JSON.parse(txt) : null; coverUrl = j?.url || j?.event?.eventCoverURL || (Array.isArray(j?.event?.eventCover) ? j.event.eventCover[0]?.url : null) || null; } catch {}
              } catch {}
              try { console.log('[admin/fetchMlbEvents] ← generateCover done', { internalId, status: genRes.status, ok: genRes.ok, coverUrl, bodySnippet }); } catch {}
            } catch (e) {
              try { console.warn('[admin/fetchMlbEvents] generateCover call failed', { internalId, error: e?.message || String(e) }); } catch {}
            }
          } else {
            try { console.warn('[admin/fetchMlbEvents] Skipping cover generation — missing internalId after upsert', { eventIdStable }); } catch {}
          }
        }
      } catch {}
    }

    return res.status(200).json({ success: true, processedCount });
  } catch (error) {
    console.error("[admin/fetchMlbEvents] Error:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
}