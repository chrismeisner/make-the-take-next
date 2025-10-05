// File: pages/api/admin/fetchNflEvents.js
import { getToken } from "next-auth/jwt";
import { query } from '../../../lib/db/postgres';
import { getDataBackend } from '../../../lib/runtimeConfig';
import { resolveSourceConfig } from '../../../lib/apiSources';
import { normalizeNflScoreboardFromWeekly } from '../../../lib/normalize';
import { randomBytes } from 'crypto';

// Airtable removed: Postgres-only

function parseEspnGameIdFromUid(uid) {
  if (!uid || typeof uid !== 'string') return null;
  const match = uid.match(/e:(\d+)/);
  return match ? match[1] : null;
}

function parseTeamsFromGame(game) {
  let homeTeamName = '';
  let awayTeamName = '';
  let homeAbbrev = '';
  let awayAbbrev = '';

  // Shape 1: game.teams is an array of entries with { team: {...}, isHome or homeAway }
  if (Array.isArray(game?.teams) && game.teams.length) {
    for (const t of game.teams) {
      const teamObj = t.team || t;
      const isHome = typeof t.isHome === 'boolean' ? t.isHome : (t.homeAway === 'home');
      const name = teamObj?.displayName || teamObj?.name || '';
      const abbr = teamObj?.abbreviation || '';
      if (isHome) {
        homeTeamName = name;
        homeAbbrev = abbr;
      } else {
        awayTeamName = name;
        awayAbbrev = abbr;
      }
    }
  }

  // Shape 2: game.competitions[0].competitors like ESPN core
  if ((!homeTeamName || !awayTeamName) && Array.isArray(game?.competitions?.[0]?.competitors)) {
    for (const c of game.competitions[0].competitors) {
      const name = c?.team?.displayName || c?.team?.name || '';
      const abbr = c?.team?.abbreviation || '';
      if (c.homeAway === 'home') {
        homeTeamName = homeTeamName || name;
        homeAbbrev = homeAbbrev || abbr;
      } else if (c.homeAway === 'away') {
        awayTeamName = awayTeamName || name;
        awayAbbrev = awayAbbrev || abbr;
      }
    }
  }

  // Shape 3: explicit home/away team objects
  if ((!homeTeamName || !awayTeamName) && (game?.homeTeam || game?.awayTeam)) {
    const h = game.homeTeam || {};
    const a = game.awayTeam || {};
    homeTeamName = homeTeamName || h.displayName || h.name || '';
    awayTeamName = awayTeamName || a.displayName || a.name || '';
    homeAbbrev = homeAbbrev || h.abbreviation || '';
    awayAbbrev = awayAbbrev || a.abbreviation || '';
  }

  // Shape 4: fallback from shortName like "DAL @ TB"
  if ((!homeAbbrev || !awayAbbrev) && typeof game?.shortName === 'string') {
    const parts = game.shortName.split('@').map(s => s.trim());
    if (parts.length === 2) {
      const [away, home] = parts;
      awayAbbrev = awayAbbrev || away.split(' ')[0];
      homeAbbrev = homeAbbrev || home.split(' ')[0];
    }
  }

  return {
    homeTeamName,
    awayTeamName,
    homeAbbrev: homeAbbrev ? String(homeAbbrev).toUpperCase() : '',
    awayAbbrev: awayAbbrev ? String(awayAbbrev).toUpperCase() : '',
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) {
    return res.status(401).json({ success: false, error: "Unauthorized" });
  }

  try {
    const { year, week, generateCovers } = req.body;
    console.log('[admin/fetchNflEvents] Request body →', { year, week });
    const src = resolveSourceConfig('nfl');
    if (!src.ok) {
      return res.status(500).json({ success: false, error: 'Missing RAPIDAPI credentials for NFL' });
    }

    if (!Number.isInteger(Number(year)) || !Number.isInteger(Number(week))) {
      return res.status(400).json({ success: false, error: 'year and week are required numeric values' });
    }

    // Try the base weekly endpoint; on playoff weeks fallback to alternate params some providers require
    const baseUrl = new URL(`https://${src.host}${src.endpoints.scoreboard}`);
    baseUrl.searchParams.set('year', String(Number(year)));
    baseUrl.searchParams.set('week', String(Number(week)));
    const attempts = [
      {},
      // Some providers require explicit postseason flags
      ...(Number(week) >= 19 ? [
        { seasonType: 'postseason' },
        { type: 'postseason' },
        { type: '3' },
        { seasonType: '3' },
      ] : []),
    ];
    let resp;
    let lastStatus = null;
    for (let i = 0; i < attempts.length; i++) {
      const extra = attempts[i] || {};
      const url = new URL(baseUrl.toString());
      Object.entries(extra).forEach(([k, v]) => url.searchParams.set(k, String(v)));
      console.log(`[admin/fetchNflEvents] Weekly fetch attempt ${i + 1}/${attempts.length}: ${url.toString()}`);
      // eslint-disable-next-line no-await-in-loop
      resp = await fetch(url.toString(), { method: 'GET', headers: src.headers });
      lastStatus = resp.status;
      if (resp.ok) break;
    }
    if (!resp || !resp.ok) {
      throw new Error(`RapidAPI weekly schedule responded with ${lastStatus || 'unknown'} (after ${attempts.length} attempts)`);
    }
    const raw = await resp.json();
    const games = normalizeNflScoreboardFromWeekly(raw);
    console.log(`[admin/fetchNflEvents] Weekly fetch aggregated ${games.length} games for year=${Number(year)}, week=${Number(week)}`);

    let processedCount = 0;
    const eventsOut = [];

    // Postgres-only: helpers will resolve teams by slug and league directly

    const backend = getDataBackend();
    const generateEventId = () => {
      try {
        return randomBytes(6).toString('hex'); // 12-char hex id
      } catch (_) {
        return Math.random().toString(36).slice(2, 14);
      }
    };
    for (const game of games) {
      const espnGameID = game?.id ? String(game.id) : null;
      const eventTime = game?.gameTime || null;
      let eventTitle = `${game?.away || ''} @ ${game?.home || ''}`.trim();
      const eventStatus = game?.gameStatus || '';
      const eventLabel = game?.currentInning || '';
      const eventLeague = 'nfl';
      // Venue and broadcast fields from normalizer
      const city = game?.venueCity || null;
      const state = game?.venueState || null;
      const venue = game?.venueName || null;
      const tv = game?.tv || null;

      // Determine home/away teams from normalized payload
      const homeAbbrev = String(game?.home || '').toUpperCase();
      const awayAbbrev = String(game?.away || '').toUpperCase();
      const homeTeamName = homeAbbrev;
      const awayTeamName = awayAbbrev;
      if (!eventTitle || eventTitle === '@') {
        if (awayAbbrev && homeAbbrev) eventTitle = `${awayAbbrev} @ ${homeAbbrev}`;
      }

      // Resolve Postgres team ids by team_slug and league
      let homeTeamIdPg = null;
      let awayTeamIdPg = null;
      try {
        if (homeAbbrev) {
          const { rows } = await query('SELECT id FROM teams WHERE UPPER(team_slug) = UPPER($1) AND UPPER(league) = UPPER($2) LIMIT 1', [homeAbbrev, eventLeague]);
          homeTeamIdPg = rows?.[0]?.id || null;
        }
        if (awayAbbrev) {
          const { rows } = await query('SELECT id FROM teams WHERE UPPER(team_slug) = UPPER($1) AND UPPER(league) = UPPER($2) LIMIT 1', [awayAbbrev, eventLeague]);
          awayTeamIdPg = rows?.[0]?.id || null;
        }
      } catch {}

      const fields = { espnGameID, eventID: String(espnGameID), eventTime, eventTitle, eventStatus, eventLabel, eventLeague };

      if (!espnGameID) {
        console.warn('[admin/fetchNflEvents] Skipping game without espnGameID', game.uid);
        continue;
      }

      // Airtable removed: no-op

      // Also upsert into Postgres if configured
      try {
        if (backend === 'postgres' && process.env.DATABASE_URL) {
          console.log(`[admin/fetchNflEvents] [PG] Upserting event espnGameID=${espnGameID} league=${eventLeague} home_pg=${homeTeamIdPg} away_pg=${awayTeamIdPg}`);
          // Minimal fields plus team names and foreign keys
          const { rows: pgRows } = await query(
            `INSERT INTO events (espn_game_id, title, league, event_time, event_id, home_team, away_team, home_team_id, away_team_id, city, state, venue, tv, week)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
             ON CONFLICT (espn_game_id) DO UPDATE SET
               title = EXCLUDED.title,
               league = EXCLUDED.league,
               event_time = EXCLUDED.event_time,
               event_id = COALESCE(events.event_id, EXCLUDED.event_id),
               home_team = COALESCE(EXCLUDED.home_team, events.home_team),
               away_team = COALESCE(EXCLUDED.away_team, events.away_team),
               home_team_id = COALESCE(EXCLUDED.home_team_id, events.home_team_id),
               away_team_id = COALESCE(EXCLUDED.away_team_id, events.away_team_id),
               city = COALESCE(EXCLUDED.city, events.city),
               state = COALESCE(EXCLUDED.state, events.state),
               venue = COALESCE(EXCLUDED.venue, events.venue),
               tv = COALESCE(EXCLUDED.tv, events.tv),
               week = COALESCE(EXCLUDED.week, events.week)
             RETURNING id`,
            [
              String(espnGameID),
              eventTitle || null,
              eventLeague,
              eventTime ? new Date(eventTime) : null,
              generateEventId(),
              homeTeamName || homeAbbrev || null,
              awayTeamName || awayAbbrev || null,
              homeTeamIdPg,
              awayTeamIdPg,
              city,
              state,
              venue,
              tv,
              Number(week),
            ]
          );
          const insertedId = pgRows?.[0]?.id || null;
          if (insertedId) {
            console.log(`[admin/fetchNflEvents] [PG] Upserted event espnGameID=${espnGameID} → id=${insertedId}`);
          } else {
            console.log(`[admin/fetchNflEvents] [PG] Upsert finished for espnGameID=${espnGameID}`);
          }
          // Confirm persisted values (include venue fields)
          try {
            const { rows: confirmRows } = await query(
              `SELECT espn_game_id, title, league, event_time, event_id, home_team, away_team, home_team_id, away_team_id, city, state, venue, tv, week
                 FROM events
                WHERE espn_game_id = $1
                LIMIT 1`,
              [String(espnGameID)]
            );
            const row = confirmRows?.[0];
            if (row) {
              console.log('[admin/fetchNflEvents] [PG] Confirmed row:', {
                espn_game_id: row.espn_game_id,
                title: row.title,
                league: row.league,
                event_time: row.event_time,
                event_id: row.event_id,
                home_team: row.home_team,
                away_team: row.away_team,
                home_team_id: row.home_team_id,
                away_team_id: row.away_team_id,
                city: row.city,
                state: row.state,
                venue: row.venue,
                tv: row.tv,
                week: row.week,
              });
            }
          } catch (confirmErr) {
            console.warn('[admin/fetchNflEvents] [PG] Confirm select failed:', confirmErr?.message || confirmErr);
          }
        }
      } catch (pgErr) {
        console.warn('[admin/fetchNflEvents] Postgres upsert failed:', pgErr?.message || pgErr);
      }

      processedCount++;
      eventsOut.push({
        espnGameID,
        eventTime,
        eventTitle,
        eventStatus,
        eventLabel,
        homeTeam: homeTeamName,
        awayTeam: awayTeamName,
        week: Number(week),
      });

      // Optionally generate event covers as part of fetch
      try {
        if (generateCovers) {
          if (backend === 'postgres') {
            // Find the internal event id we just upserted
            const { rows: eRows } = await query('SELECT id FROM events WHERE espn_game_id = $1 LIMIT 1', [String(espnGameID)]);
            const internalId = eRows?.[0]?.id;
            if (internalId) {
              // Call internal API to generate cover for this event id
              try {
                const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
                const path = `/api/admin/events/${internalId}/generateCover`;
                try { console.log('[admin/fetchNflEvents] → generateCover start', { internalId, baseUrl, path }); } catch {}
                const genRes = await fetch(`${baseUrl}${path}`, { method: 'POST', headers: { Cookie: req.headers.cookie || '' } });
                let bodySnippet = null;
                try { const txt = await genRes.text(); bodySnippet = txt ? txt.slice(0, 200) : null; } catch {}
                try { console.log('[admin/fetchNflEvents] ← generateCover done', { internalId, status: genRes.status, ok: genRes.ok, bodySnippet }); } catch {}
              } catch (e) {
                try { console.warn('[admin/fetchNflEvents] generateCover call failed', { internalId, error: e?.message || String(e) }); } catch {}
              }
            } else {
              try { console.warn('[admin/fetchNflEvents] Skipping cover generation — missing internalId after upsert', { espnGameID }); } catch {}
            }
          } else if (backend === 'airtable') {
            // Best-effort: lookup Airtable Event record by espnGameID and trigger generate via generic batch job if needed
            // For Airtable, we rely on existing batch job endpoints; skipping here to keep flow simple
          }
        }
      } catch (_) {}
    }

    // Postgres-only response: no Airtable link fields or slug backfill

    console.log(`[admin/fetchNflEvents] Found ${processedCount} games for year=${year}, week=${Number(week)}`);
    return res.status(200).json({ success: true, processedCount, events: eventsOut });
  } catch (error) {
    console.error("[admin/fetchNflEvents] Error:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
}