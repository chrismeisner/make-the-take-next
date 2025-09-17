// Utilities to normalize upstream API responses into a consistent shape for the UI

function safeNumber(value) {
  const num = typeof value === 'string' ? Number(value) : value;
  return Number.isFinite(num) ? num : undefined;
}

function coerceString(value, fallback = '') {
  if (value == null) return fallback;
  return String(value);
}

function collectEventNodes(root) {
  const events = [];
  const seen = new Set();
  function visit(node) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    // Heuristic: an event-like node has competitions (array) and an id
    if (Array.isArray(node.competitions) && (node.id || node.uid)) {
      const key = coerceString(node.id || node.uid);
      if (!seen.has(key)) {
        seen.add(key);
        events.push(node);
      }
    }
    for (const val of Object.values(node)) visit(val);
  }
  visit(root);
  return events;
}

function normalizeLeadersArray(leadersArr) {
  const out = {};
  if (!Array.isArray(leadersArr)) return out;
  for (const entry of leadersArr) {
    const metricKey = entry?.name || entry?.abbreviation || entry?.shortDisplayName;
    if (!metricKey) continue;
    const metric = String(metricKey);
    const first = Array.isArray(entry.leaders) ? entry.leaders[0] : undefined;
    const value = first?.value;
    const playerId = first?.athlete?.id || first?.playerId || first?.athleteId;
    const displayValue = first?.displayValue;
    out[metric] = {
      value: value != null ? value : undefined,
      playerId: playerId != null ? String(playerId) : undefined,
      displayValue: displayValue != null ? String(displayValue) : undefined,
    };
  }
  return out;
}

function extractHEfromStatistics(statsArr) {
  const result = {};
  if (!Array.isArray(statsArr)) return result;
  for (const s of statsArr) {
    const name = String(s?.name || '').toLowerCase();
    const val = safeNumber(s?.displayValue) ?? safeNumber(s?.value);
    if (val == null) continue;
    if (name === 'hits' || name === 'h') result.H = val;
    if (name === 'errors' || name === 'e') result.E = val;
    if (name === 'runs' || name === 'r') result.R = val;
  }
  return result;
}

export function normalizeMajorMlbScoreboard(raw) {
  try {
    const events = collectEventNodes(raw);
    const games = [];
    for (const ev of events) {
      const competitions = Array.isArray(ev.competitions) ? ev.competitions : [];
      const comp = competitions[0] || {};
      const competitors = Array.isArray(comp.competitors) ? comp.competitors : [];
      const home = competitors.find((c) => c?.homeAway === 'home') || competitors[0] || {};
      const away = competitors.find((c) => c?.homeAway === 'away') || competitors[1] || {};

      const homeTeam = home.team || {};
      const awayTeam = away.team || {};

      const homeAbv = coerceString(homeTeam.abbreviation || homeTeam.shortDisplayName || homeTeam.name || homeTeam.id).toUpperCase();
      const awayAbv = coerceString(awayTeam.abbreviation || awayTeam.shortDisplayName || awayTeam.name || awayTeam.id).toUpperCase();
      const homeName = coerceString(homeTeam.displayName || homeTeam.shortDisplayName || homeTeam.name || '').trim();
      const awayName = coerceString(awayTeam.displayName || awayTeam.shortDisplayName || awayTeam.name || '').trim();
      const homeTeamId = homeTeam && (homeTeam.id != null || homeTeam.teamId != null) ? coerceString(homeTeam.id || homeTeam.teamId) : undefined;
      const awayTeamId = awayTeam && (awayTeam.id != null || awayTeam.teamId != null) ? coerceString(awayTeam.id || awayTeam.teamId) : undefined;

      const homeScore = safeNumber(home.score);
      const awayScore = safeNumber(away.score);

      // Build lineScore with at least runs; augment with hits/errors if available
      const homeAgg = { R: homeScore };
      const awayAgg = { R: awayScore };
      Object.assign(homeAgg, extractHEfromStatistics(home.statistics));
      Object.assign(awayAgg, extractHEfromStatistics(away.statistics));

      // Status/time info
      const status = ev.status || comp.status || {};
      const statusType = status.type || {};
      const gameStatus = statusType.shortDetail || statusType.detail || statusType.description || '';
      const period = status.period;
      const displayClock = status.displayClock;
      const currentInning = (statusType?.state === 'in') && period ? `Inning ${period}` : (statusType?.completed ? 'Final' : gameStatus);
      const gameTime = ev.date || comp.date || '';

      // Derive top performers from team leaders
      const homeLeaders = normalizeLeadersArray(home.leaders);
      const awayLeaders = normalizeLeadersArray(away.leaders);
      const topPerformers = {};
      if (homeAbv) topPerformers[homeAbv] = { leaders: homeLeaders };
      if (awayAbv) topPerformers[awayAbv] = { leaders: awayLeaders };

      games.push({
        id: coerceString(ev.id || comp.id || ev.uid || comp.uid),
        away: awayAbv,
        home: homeAbv,
        awayTeamId,
        homeTeamId,
        awayName,
        homeName,
        awayTeam: awayAbv,
        homeTeam: homeAbv,
        lineScore: { away: awayAgg, home: homeAgg },
        gameStatus,
        currentInning,
        gameTime,
        topPerformers,
      });
    }

    return games;
  } catch (e) {
    // Fail safe: return empty list
    return [];
  }
}

export function normalizeNflScoreboardFromWeekly(raw) {
  try {
    // Weekly endpoint often returns an object keyed by date => { games: [ ... ESPN-style events ... ] }
    // Reuse the generic ESPN event extraction approach used for MLB
    const events = collectEventNodes(raw);
    const games = [];
    for (const ev of events) {
      const competitions = Array.isArray(ev.competitions) ? ev.competitions : [];
      const comp = competitions[0] || {};
      const venueObj = comp.venue || {};
      const venueAddr = venueObj.address || {};
      const competitors = Array.isArray(comp.competitors) ? comp.competitors : [];
      const home = competitors.find((c) => c?.homeAway === 'home') || competitors[0] || {};
      const away = competitors.find((c) => c?.homeAway === 'away') || competitors[1] || {};

      const homeTeam = home.team || {};
      const awayTeam = away.team || {};

      const homeAbv = coerceString(homeTeam.abbreviation || homeTeam.shortDisplayName || homeTeam.name || homeTeam.id).toUpperCase();
      const awayAbv = coerceString(awayTeam.abbreviation || awayTeam.shortDisplayName || awayTeam.name || awayTeam.id).toUpperCase();

      const homeScore = safeNumber(home.score);
      const awayScore = safeNumber(away.score);

      const status = ev.status || comp.status || {};
      const statusType = status.type || {};
      const period = status.period;
      const gameStatus = statusType.shortDetail || statusType.detail || statusType.description || '';
      const currentPeriod = (statusType?.state === 'in' && period) ? `Q${period}` : (statusType?.completed ? 'Final' : gameStatus);
      const gameTime = ev.date || comp.date || '';
      // Broadcasts: prefer explicit broadcasts.names for TV; geoBroadcasts type shortName 'Streaming' for streaming
      let tvNames = [];
      if (Array.isArray(comp.broadcasts) && comp.broadcasts.length) {
        const names = comp.broadcasts[0]?.names;
        if (Array.isArray(names)) tvNames = names.filter(Boolean).map((n) => String(n));
      }

      games.push({
        id: coerceString(ev.id || comp.id || ev.uid || comp.uid),
        away: awayAbv,
        home: homeAbv,
        awayTeam: awayAbv,
        homeTeam: homeAbv,
        lineScore: { away: { R: awayScore }, home: { R: homeScore } },
        gameStatus,
        currentInning: currentPeriod,
        gameTime,
        venueCity: coerceString(venueAddr.city || ''),
        venueState: coerceString(venueAddr.state || ''),
        venueName: coerceString(venueObj.fullName || venueObj.name || ''),
        tv: tvNames.join('/'),
        week: typeof ev?.week?.number === 'number' ? ev.week.number : (typeof ev?.week === 'number' ? ev.week : undefined),
        topPerformers: {},
      });
    }
    return games;
  } catch (e) {
    return [];
  }
}

export default {
  normalizeMajorMlbScoreboard,
  normalizeNflScoreboardFromWeekly,
};


