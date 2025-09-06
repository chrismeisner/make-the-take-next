// File: pages/api/admin/fetchNflEvents.js
import { getToken } from "next-auth/jwt";
import Airtable from "airtable";
import { query } from '../../../lib/db/postgres';
import { getDataBackend } from '../../../lib/runtimeConfig';
import { resolveSourceConfig } from '../../../lib/apiSources';
import { normalizeNflScoreboardFromWeekly } from '../../../lib/normalize';
import { randomBytes } from 'crypto';

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY })
  .base(process.env.AIRTABLE_BASE_ID);

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
    const { year, week } = req.body;
    console.log('[admin/fetchNflEvents] Request body →', { year, week });
    const src = resolveSourceConfig('nfl');
    if (!src.ok) {
      return res.status(500).json({ success: false, error: 'Missing RAPIDAPI credentials for NFL' });
    }

    if (!Number.isInteger(Number(year)) || !Number.isInteger(Number(week))) {
      return res.status(400).json({ success: false, error: 'year and week are required numeric values' });
    }

    const url = new URL(`https://${src.host}${src.endpoints.scoreboard}`);
    url.searchParams.set('year', String(Number(year)));
    url.searchParams.set('week', String(Number(week)));
    console.log(`[admin/fetchNflEvents] Weekly fetch: ${url.toString()}`);
    const resp = await fetch(url.toString(), { method: 'GET', headers: src.headers });
    if (!resp.ok) {
      throw new Error(`RapidAPI weekly schedule responded with ${resp.status}`);
    }
    const raw = await resp.json();
    const games = normalizeNflScoreboardFromWeekly(raw);
    console.log(`[admin/fetchNflEvents] Weekly fetch aggregated ${games.length} games for year=${Number(year)}, week=${Number(week)}`);

    let processedCount = 0;
    const eventsOut = [];

    // Cache for mapping Airtable Team record IDs -> Postgres teams.id
    const pgTeamIdByAirtableId = new Map();
    // Helper to resolve a Postgres team id given an Airtable Teams record id
    async function resolvePgTeamId(airtableTeamRecordId) {
      if (!airtableTeamRecordId) return null;
      if (pgTeamIdByAirtableId.has(airtableTeamRecordId)) {
        return pgTeamIdByAirtableId.get(airtableTeamRecordId);
      }
      try {
        const rec = await base('Teams').find(airtableTeamRecordId);
        const f = rec?.fields || {};
        const teamIdText = f.teamID || null;
        const teamSlug = f.teamSlug || f.teamAbbreviation || null;
        // Try lookup by team_id first, then by slug (case-insensitive)
        let pgId = null;
        if (teamIdText) {
          const { rows } = await query('SELECT id FROM teams WHERE team_id = $1 LIMIT 1', [teamIdText]);
          pgId = rows?.[0]?.id || null;
        }
        if (!pgId && teamSlug) {
          const { rows } = await query('SELECT id FROM teams WHERE team_slug = $1 OR UPPER(team_slug) = UPPER($1) LIMIT 1', [teamSlug]);
          pgId = rows?.[0]?.id || null;
        }
        pgTeamIdByAirtableId.set(airtableTeamRecordId, pgId);
        return pgId;
      } catch (_) {
        return null;
      }
    }

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

      // Link Teams favoring teamAbbreviation, then nickname fallback
      let homeTeamLink = [];
      let awayTeamLink = [];
      try {
        if (homeAbbrev) {
          const homeRecs = await base('Teams')
            .select({ filterByFormula: `AND({teamAbbreviation}="${homeAbbrev}", LOWER({teamLeague})="nfl")`, maxRecords: 1 })
            .firstPage();
          if (homeRecs.length) homeTeamLink = [homeRecs[0].id];
        }
        if (awayAbbrev) {
          const awayRecs = await base('Teams')
            .select({ filterByFormula: `AND({teamAbbreviation}="${awayAbbrev}", LOWER({teamLeague})="nfl")`, maxRecords: 1 })
            .firstPage();
          if (awayRecs.length) awayTeamLink = [awayRecs[0].id];
        }
      } catch (e) {
        console.warn('[admin/fetchNflEvents] Team link lookup failed:', e);
      }

      // Summary log for linked records
      console.log(
        `[admin/fetchNflEvents] Team link results: ` +
        `home="${homeTeamName}" (${homeAbbrev}) -> ${homeTeamLink[0] || 'none'} | ` +
        `away="${awayTeamName}" (${awayAbbrev}) -> ${awayTeamLink[0] || 'none'}`
      );

      const fields = {
        espnGameID,
        eventID: String(espnGameID),
        eventTime,
        eventTitle,
        eventStatus,
        eventLabel,
        homeTeamLink,
        awayTeamLink,
        eventLeague,
      };

      if (!espnGameID) {
        console.warn('[admin/fetchNflEvents] Skipping game without espnGameID', game.uid);
        continue;
      }

      if (backend === 'airtable') {
        const existing = await base('Events')
          .select({ filterByFormula: `{espnGameID}="${espnGameID}"`, maxRecords: 1 })
          .firstPage();
        if (existing.length) {
          await base('Events').update([{ id: existing[0].id, fields }]);
          console.log(`[admin/fetchNflEvents] Upserted Event (updated) ${espnGameID} (home=${homeAbbrev}, away=${awayAbbrev}) → ${existing[0].id}`);
        } else {
          const created = await base('Events').create([{ fields }]);
          console.log(`[admin/fetchNflEvents] Upserted Event (created) ${espnGameID} (home=${homeAbbrev}, away=${awayAbbrev}) → ${created[0]?.id}`);
        }
      }

      // Also upsert into Postgres if configured
      try {
        if (backend === 'postgres' && process.env.DATABASE_URL) {
          let homeTeamIdPg = Array.isArray(homeTeamLink) && homeTeamLink.length
            ? await resolvePgTeamId(homeTeamLink[0])
            : null;
          let awayTeamIdPg = Array.isArray(awayTeamLink) && awayTeamLink.length
            ? await resolvePgTeamId(awayTeamLink[0])
            : null;
          console.log(`[admin/fetchNflEvents] [PG] Upserting event espnGameID=${espnGameID} league=${eventLeague} home_pg=${homeTeamIdPg} away_pg=${awayTeamIdPg}`);
          // Resolve team_ids by team_slug + league (fallback if link lookup failed)
          try {
            if (!homeTeamIdPg && homeAbbrev) {
              const { rows } = await query('SELECT id FROM teams WHERE UPPER(team_slug) = UPPER($1) AND UPPER(league) = UPPER($2) LIMIT 1', [homeAbbrev, eventLeague]);
              homeTeamIdPg = rows?.[0]?.id || null;
            }
            if (!awayTeamIdPg && awayAbbrev) {
              const { rows } = await query('SELECT id FROM teams WHERE UPPER(team_slug) = UPPER($1) AND UPPER(league) = UPPER($2) LIMIT 1', [awayAbbrev, eventLeague]);
              awayTeamIdPg = rows?.[0]?.id || null;
            }
          } catch {}
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
        homeTeamLink,
        awayTeamLink,
        homeTeam: homeTeamName,
        awayTeam: awayTeamName,
        week: Number(week),
      });
    }

    if (eventsOut.length) {
      const teamRecs = await base('Teams').select({ fields: ['teamSlug'] }).all();
      const slugMap = Object.fromEntries(teamRecs.map(r => [r.id, r.fields.teamSlug]));
      eventsOut.forEach(e => {
        e.homeTeamSlug = e.homeTeamLink?.[0] ? slugMap[e.homeTeamLink[0]] || null : null;
        e.awayTeamSlug = e.awayTeamLink?.[0] ? slugMap[e.awayTeamLink[0]] || null : null;
      });
    }

    console.log(`[admin/fetchNflEvents] Found ${processedCount} games for year=${year}, week=${Number(week)}`);
    return res.status(200).json({ success: true, processedCount, events: eventsOut });
  } catch (error) {
    console.error("[admin/fetchNflEvents] Error:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
}