// File: pages/api/admin/fetchNflEvents.js
import { getToken } from "next-auth/jwt";
import Airtable from "airtable";

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
    const rapidApiKey = process.env.RAPIDAPI_KEY;
    const rapidApiHost = process.env.RAPIDAPI_HOST || 'nfl-api1.p.rapidapi.com';
    if (!rapidApiKey) {
      return res.status(500).json({ success: false, error: 'Missing RAPIDAPI_KEY env var' });
    }

    if (!Number.isInteger(Number(year)) || !Number.isInteger(Number(week))) {
      return res.status(400).json({ success: false, error: 'year and week are required numeric values' });
    }

    const url = `https://${rapidApiHost}/nflschedule?year=${Number(year)}&week=${Number(week)}`;
    console.log(`[admin/fetchNflEvents] Weekly fetch: ${url}`);
    const resp = await fetch(url, {
      method: 'GET',
      headers: {
        'x-rapidapi-host': rapidApiHost,
        'x-rapidapi-key': rapidApiKey,
      },
    });
    if (!resp.ok) {
      throw new Error(`RapidAPI weekly schedule responded with ${resp.status}`);
    }
    const json = await resp.json();
    const games = [];
    for (const day of Object.keys(json || {})) {
      const dayGames = json[day]?.games || [];
      games.push(...dayGames);
    }
    console.log(`[admin/fetchNflEvents] Weekly fetch aggregated ${games.length} games for year=${Number(year)}, week=${Number(week)}`);

    let processedCount = 0;
    const eventsOut = [];

    for (const game of games) {
      const espnGameID = parseEspnGameIdFromUid(game.uid) || game.id || null;
      const eventTime = game.date;
      let eventTitle = game.shortName || '';
      const eventStatus = game.status?.type?.state || game.status?.type?.name || '';
      const eventLabel = game.status?.type?.shortDetail || game.status?.type?.detail || game.status?.type?.description || '';
      const eventLeague = 'nfl';

      // Determine home/away teams
      const parsed = parseTeamsFromGame(game);
      const homeTeamName = parsed.homeTeamName;
      const awayTeamName = parsed.awayTeamName;
      const homeAbbrev = parsed.homeAbbrev;
      const awayAbbrev = parsed.awayAbbrev;
      if (!eventTitle && awayAbbrev && homeAbbrev) {
        eventTitle = `${awayAbbrev} @ ${homeAbbrev}`;
      }
      if (!homeTeamName && !awayTeamName && !homeAbbrev && !awayAbbrev) {
        console.warn('[admin/fetchNflEvents] Could not parse teams from game payload. Keys:', Object.keys(game || {}));
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
        if (!homeTeamLink.length && homeTeamName) {
          const nickname = String(homeTeamName).trim().split(' ').slice(-1)[0];
          const homeRecsByName = await base('Teams')
            .select({ filterByFormula: `AND({teamName}="${nickname}", LOWER({teamLeague})="nfl")`, maxRecords: 1 })
            .firstPage();
          if (homeRecsByName.length) homeTeamLink = [homeRecsByName[0].id];
        }
        if (awayAbbrev) {
          const awayRecs = await base('Teams')
            .select({ filterByFormula: `AND({teamAbbreviation}="${awayAbbrev}", LOWER({teamLeague})="nfl")`, maxRecords: 1 })
            .firstPage();
          if (awayRecs.length) awayTeamLink = [awayRecs[0].id];
        }
        if (!awayTeamLink.length && awayTeamName) {
          const nickname = String(awayTeamName).trim().split(' ').slice(-1)[0];
          const awayRecsByName = await base('Teams')
            .select({ filterByFormula: `AND({teamName}="${nickname}", LOWER({teamLeague})="nfl")`, maxRecords: 1 })
            .firstPage();
          if (awayRecsByName.length) awayTeamLink = [awayRecsByName[0].id];
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