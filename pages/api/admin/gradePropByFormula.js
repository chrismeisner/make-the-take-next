import { getToken } from 'next-auth/jwt';
import Airtable from 'airtable';
import { resolveSourceConfig } from '../../../lib/apiSources';
import { normalizeMajorMlbScoreboard } from '../../../lib/normalize';

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY })
  .base(process.env.AIRTABLE_BASE_ID);

// --- Major MLB helpers (scoreboard + boxscore normalization) ---
async function fetchMajorMlbScoreboardYYYYMMDD(yyyymmdd) {
  const src = resolveSourceConfig('major-mlb');
  if (!src.ok) throw new Error(src.error || 'Major MLB source not configured');
  const yyyy = String(yyyymmdd).slice(0, 4);
  const mm = String(yyyymmdd).slice(4, 6);
  const dd = String(yyyymmdd).slice(6, 8);
  const url = new URL(`https://${src.host}${src.endpoints.scoreboard}`);
  url.searchParams.set('year', yyyy);
  url.searchParams.set('month', mm);
  url.searchParams.set('day', dd);
  const resp = await fetch(url.toString(), { method: 'GET', headers: src.headers });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`Major MLB scoreboard failed (${resp.status}): ${text || resp.statusText}`);
  }
  const data = await resp.json().catch(() => ({}));
  const raw = data?.body || data || {};
  return normalizeMajorMlbScoreboard(raw);
}

function coerceNumeric(val) {
  if (typeof val === 'number') return Number.isFinite(val) ? val : undefined;
  if (typeof val !== 'string') return undefined;
  const trimmed = val.trim();
  if (/^[+-]?\d*(?:\.\d+)?$/.test(trimmed) && trimmed !== '' && trimmed !== '+' && trimmed !== '-') {
    const n = parseFloat(trimmed);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function normalizeMajorMlbPlayers(rawBox) {
  const map = {};
  const keySet = new Set();
  let battingLabels = undefined;
  try {
    const teamBlocks = Array.isArray(rawBox?.players) ? rawBox.players : [];
    for (const teamBlock of teamBlocks) {
      const teamAbv = String(teamBlock?.team?.abbreviation || '').toUpperCase();
      const statGroups = Array.isArray(teamBlock?.statistics) ? teamBlock.statistics : [];
      for (const group of statGroups) {
        const keys = Array.isArray(group?.keys) ? group.keys : [];
        const labels = Array.isArray(group?.labels) ? group.labels : [];
        const athletes = Array.isArray(group?.athletes) ? group.athletes : [];
        const isBatting = (group?.type === 'batting') || (group?.name === 'batting' || group?.displayName === 'Batting');
        if (isBatting && !battingLabels && labels.length) battingLabels = labels.map((s) => String(s));
        for (const row of athletes) {
          const athlete = row?.athlete || {};
          const id = String(athlete?.id || '').trim();
          const longName = athlete?.displayName || athlete?.shortName || '';
          const pos = row?.position?.abbreviation || athlete?.position?.abbreviation || '';
          const values = Array.isArray(row?.stats) ? row.stats : [];
          if (!id && !longName) continue;
          const playerId = id || `${teamAbv || 'UNK'}:${longName || 'UNKNOWN'}`;
          const existing = map[playerId] || { stats: {} };
          const stats = { ...existing.stats };
          const count = Math.min(keys.length, values.length);
          for (let i = 0; i < count; i++) {
            const key = String(keys[i]);
            const val = values[i];
            const num = coerceNumeric(val);
            if (num !== undefined) {
              stats[key] = num;
              keySet.add(key);
            }
          }
          let gameLine = existing.gameLine ? { ...existing.gameLine } : undefined;
          if (isBatting && Array.isArray(labels) && labels.length && Array.isArray(values) && values.length) {
            gameLine = gameLine || {};
            const take = Math.min(labels.length, values.length);
            for (let i = 0; i < take; i++) {
              const label = String(labels[i]);
              gameLine[label] = values[i];
            }
          }
          map[playerId] = {
            id: playerId,
            longName: longName || existing.longName || playerId,
            firstName: existing.firstName || '',
            lastName: existing.lastName || '',
            pos: pos || existing.pos || '',
            teamAbv: teamAbv || existing.teamAbv || '',
            stats,
            ...(gameLine ? { gameLine } : {}),
          };
        }
      }
    }
  } catch {}
  return { playersById: map, statKeys: Array.from(keySet).sort(), battingLabels };
}

async function fetchMajorMlbBoxscorePlayers(gameID) {
  const src = resolveSourceConfig('major-mlb');
  if (!src.ok) throw new Error(src.error || 'Major MLB source not configured');
  const path = `${src.endpoints.boxScore.replace(/\/$/, '')}/${encodeURIComponent(String(gameID))}`;
  const url = new URL(`https://${src.host}${path}`);
  const upstream = await fetch(url.toString(), { method: 'GET', headers: src.headers });
  if (!upstream.ok) {
    const text = await upstream.text().catch(() => '');
    throw new Error(`Major MLB boxscore failed (${upstream.status}): ${text || upstream.statusText}`);
  }
  const data = await upstream.json().catch(() => ({}));
  const raw = data?.body || data || {};
  return normalizeMajorMlbPlayers(raw);
}

function toYYYYMMDD(dateLike) {
  const d = new Date(dateLike);
  const yr = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${yr}${mo}${da}`;
}

function compareWithComparator(valueNumber, comparator, thresholdNumber) {
  switch (String(comparator)) {
    case 'gt': return valueNumber > thresholdNumber;
    case 'gte': return valueNumber >= thresholdNumber;
    case 'eq': return valueNumber === thresholdNumber;
    case 'lte': return valueNumber <= thresholdNumber;
    case 'lt': return valueNumber < thresholdNumber;
    default: return false;
  }
}

export default async function handler(req, res) {
  const startedAt = Date.now();
  const method = req.method;
  if (method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }
  let body = {};
  try { body = req.body || {}; } catch {}
  const airtableId = body?.airtableId || null;
  const dryRun = Boolean(body?.dryRun);
  const overrideParams = body?.overrideFormulaParams || {};
  console.log('[gradePropByFormula] Incoming request', {
    method,
    airtableId,
    dryRun,
    overrideParamKeys: Object.keys(overrideParams || {}),
    ua: req.headers['user-agent'] || '',
    referer: req.headers['referer'] || '',
  });

  const baseId = process.env.AIRTABLE_BASE_ID;
  const apiKey = process.env.AIRTABLE_API_KEY;
  if (!baseId || !apiKey) {
    return res.status(500).json({ success: false, error: 'Airtable not configured' });
  }
  const base = new Airtable({ apiKey }).base(baseId);

  try {
    if (!airtableId) {
      return res.status(400).json({ success: false, error: 'Missing airtableId' });
    }
    // Load prop
    const propRec = await base('Props').find(airtableId);
    const f = propRec.fields || {};
    const gradingMode = String(f.gradingMode || '').toLowerCase();
    const formulaKey = String(f.formulaKey || '').toLowerCase();
    const rawParams = f.formulaParams || '';
    let params = {};
    try { params = rawParams && typeof rawParams === 'string' ? JSON.parse(rawParams) : (rawParams || {}); } catch {}
    // Merge overrides
    params = { ...(params || {}), ...(overrideParams || {}) };

    console.log('[gradePropByFormula] Prop loaded', {
      gradingMode,
      formulaKey,
      hasParams: !!params,
      keys: Object.keys(params || {}),
    });

    if (gradingMode !== 'auto') {
      return res.status(400).json({ success: false, error: 'Prop is not set to auto grading' });
    }
    if (formulaKey === 'who_wins') {
      const espnGameID = String(params?.espnGameID || '').trim();
      const gameDate = String(params?.gameDate || '').trim();
      const sideAMap = String(params?.whoWins?.sideAMap || '').toLowerCase();
      const sideBMap = String(params?.whoWins?.sideBMap || '').toLowerCase();
      if (!espnGameID || !gameDate || !sideAMap || !sideBMap) {
        return res.status(400).json({ success: false, error: 'Missing required params for who_wins (espnGameID, gameDate, whoWins.sideAMap, whoWins.sideBMap)' });
      }

      // Fetch scoreboard for the date and locate our game by ESPN ID
      const src = resolveSourceConfig('major-mlb');
      if (!src.ok) throw new Error(src.error || 'Major MLB source not configured');
      const yyyy = gameDate.slice(0, 4);
      const mm = gameDate.slice(4, 6);
      const dd = gameDate.slice(6, 8);
      const url = new URL(`https://${src.host}${src.endpoints.scoreboard}`);
      url.searchParams.set('year', yyyy);
      url.searchParams.set('month', mm);
      url.searchParams.set('day', dd);
      console.log('[gradePropByFormula] Fetching scoreboard', { url: url.toString(), gameDate, espnGameID });
      const upstream = await fetch(url.toString(), { method: 'GET', headers: src.headers });
      const data = await upstream.json().catch(() => ({}));
      const raw = data?.body || data || {};
      const games = normalizeMajorMlbScoreboard(raw) || [];
      const game = games.find((g) => String(g?.id || '').trim() === espnGameID);
      if (!game) {
        return res.status(404).json({ success: false, error: `Game not found for espnGameID=${espnGameID} on ${gameDate}` });
      }
      const homeR = Number(game?.lineScore?.home?.R ?? NaN);
      const awayR = Number(game?.lineScore?.away?.R ?? NaN);
      if (!Number.isFinite(homeR) || !Number.isFinite(awayR)) {
        return res.status(409).json({ success: false, error: 'Score not available yet. Try again later.' });
      }
      const winnerSide = homeR > awayR ? 'home' : (awayR > homeR ? 'away' : 'push');
      console.log('[gradePropByFormula] Computed winner', { homeR, awayR, winnerSide });

      // Map winner to A/B
      let newStatus = 'push';
      if (winnerSide !== 'push') {
        newStatus = (winnerSide === sideAMap) ? 'gradedA' : (winnerSide === sideBMap) ? 'gradedB' : 'push';
      }
      const propResult = `${game.home} ${homeR} - ${awayR} ${game.away}`;

      if (!dryRun) {
        await base('Props').update([
          {
            id: airtableId,
            fields: {
              propStatus: newStatus,
              gradedAt: new Date().toISOString(),
              propResult,
            },
          },
        ]);
      }

      const elapsedMs = Date.now() - startedAt;
      console.log('[gradePropByFormula] Completed', { airtableId, newStatus, dryRun, elapsedMs });
      return res.status(200).json({ success: true, propStatus: newStatus, propResult, meta: { elapsedMs, dryRun } });
    }

    if (formulaKey === 'stat_over_under') {
      const espnGameID = String(params?.espnGameID || '').trim();
      const gameDate = String(params?.gameDate || '').trim();
      const entity = String(params?.entity || 'player').toLowerCase();
      const metric = String(params?.metric || '').trim();
      const sides = params?.sides || {};
      const sideA = sides?.A || {};
      const sideB = sides?.B || {};
      if (!espnGameID || !gameDate || !metric || !sideA?.comparator || sideA?.threshold == null || !sideB?.comparator || sideB?.threshold == null) {
        return res.status(400).json({ success: false, error: 'Missing required params for stat_over_under (espnGameID, gameDate, metric, sides.A/B comparator+threshold)' });
      }

      // MVP: player-only support
      if (entity !== 'player') {
        return res.status(400).json({ success: false, error: 'stat_over_under currently supports entity=player only' });
      }
      const playerId = String(params?.playerId || '').trim();
      if (!playerId) {
        return res.status(400).json({ success: false, error: 'Missing playerId for stat_over_under (entity=player)' });
      }

      // Fetch normalized player stats from Major MLB boxscore
      const { playersById } = await fetchMajorMlbBoxscorePlayers(espnGameID);
      const player = playersById?.[playerId];
      if (!player) {
        return res.status(404).json({ success: false, error: `Player ${playerId} not found in boxscore` });
      }
      const valueRaw = player?.stats?.[metric];
      const valueNumber = Number(valueRaw);
      if (!Number.isFinite(valueNumber)) {
        return res.status(409).json({ success: false, error: `Metric ${metric} not available for player ${playerId}` });
      }

      const aPass = compareWithComparator(valueNumber, sideA.comparator, Number(sideA.threshold));
      const bPass = compareWithComparator(valueNumber, sideB.comparator, Number(sideB.threshold));
      let newStatus = 'push';
      if (aPass && !bPass) newStatus = 'gradedA';
      else if (bPass && !aPass) newStatus = 'gradedB';
      else newStatus = 'push';
      const propResult = `player ${playerId} ${metric}=${valueNumber}`;

      if (!dryRun) {
        await base('Props').update([
          {
            id: airtableId,
            fields: {
              propStatus: newStatus,
              gradedAt: new Date().toISOString(),
              propResult,
            },
          },
        ]);
      }

      const elapsedMs = Date.now() - startedAt;
      console.log('[gradePropByFormula] Completed stat_over_under', { airtableId, newStatus, dryRun, elapsedMs });
      return res.status(200).json({ success: true, propStatus: newStatus, propResult, meta: { elapsedMs, dryRun } });
    }

    if (formulaKey === 'player_h2h') {
      const espnGameID = String(params?.espnGameID || '').trim();
      const gameDate = String(params?.gameDate || '').trim();
      const metric = String(params?.metric || '').trim();
      const playerAId = String(params?.playerAId || params?.playerAID || params?.playerA || '').trim();
      const playerBId = String(params?.playerBId || params?.playerBID || params?.playerB || '').trim();
      const winnerRule = String(params?.winnerRule || 'higher').toLowerCase();
      if (!espnGameID || !gameDate || !metric || !playerAId || !playerBId) {
        return res.status(400).json({ success: false, error: 'Missing required params for player_h2h (espnGameID, gameDate, metric, playerAId, playerBId)' });
      }

      const { playersById } = await fetchMajorMlbBoxscorePlayers(espnGameID);
      const pA = playersById?.[playerAId];
      const pB = playersById?.[playerBId];
      if (!pA) return res.status(404).json({ success: false, error: `Player A ${playerAId} not found in boxscore` });
      if (!pB) return res.status(404).json({ success: false, error: `Player B ${playerBId} not found in boxscore` });

      const vA = Number(pA?.stats?.[metric]);
      const vB = Number(pB?.stats?.[metric]);
      if (!Number.isFinite(vA)) return res.status(409).json({ success: false, error: `Metric ${metric} not available for player A ${playerAId}` });
      if (!Number.isFinite(vB)) return res.status(409).json({ success: false, error: `Metric ${metric} not available for player B ${playerBId}` });

      let newStatus = 'push';
      if (winnerRule === 'lower') {
        if (vA < vB) newStatus = 'gradedA';
        else if (vB < vA) newStatus = 'gradedB';
        else newStatus = 'push';
      } else {
        if (vA > vB) newStatus = 'gradedA';
        else if (vB > vA) newStatus = 'gradedB';
        else newStatus = 'push';
      }
      const propResult = `A:${playerAId} ${metric}=${vA} vs B:${playerBId} ${metric}=${vB}`;

      if (!dryRun) {
        await base('Props').update([
          { id: airtableId, fields: { propStatus: newStatus, gradedAt: new Date().toISOString(), propResult } },
        ]);
      }

      const elapsedMs = Date.now() - startedAt;
      console.log('[gradePropByFormula] Completed player_h2h', { airtableId, newStatus, dryRun, elapsedMs });
      return res.status(200).json({ success: true, propStatus: newStatus, propResult, meta: { elapsedMs, dryRun } });
    }

    if (formulaKey === 'player_multi_stat_ou') {
      const espnGameID = String(params?.espnGameID || '').trim();
      const gameDate = String(params?.gameDate || '').trim();
      const metrics = Array.isArray(params?.metrics) ? params.metrics.filter(Boolean) : [];
      const entity = String(params?.entity || 'player').toLowerCase();
      const sides = params?.sides || {};
      const sideA = sides?.A || {};
      const sideB = sides?.B || {};
      if (!espnGameID || !gameDate || !metrics.length || entity !== 'player' || !sideA?.comparator || sideA?.threshold == null || !sideB?.comparator || sideB?.threshold == null) {
        return res.status(400).json({ success: false, error: 'Missing required params for player_multi_stat_ou (espnGameID, gameDate, metrics[], entity=player, sides.A/B comparator+threshold)' });
      }
      const playerId = String(params?.playerId || '').trim();
      if (!playerId) {
        return res.status(400).json({ success: false, error: 'Missing playerId for player_multi_stat_ou' });
      }

      const { playersById } = await fetchMajorMlbBoxscorePlayers(espnGameID);
      const player = playersById?.[playerId];
      if (!player) return res.status(404).json({ success: false, error: `Player ${playerId} not found in boxscore` });
      let sum = 0;
      for (const key of metrics) {
        const v = Number(player?.stats?.[key]);
        if (Number.isFinite(v)) sum += v;
      }
      const aPass = compareWithComparator(sum, sideA.comparator, Number(sideA.threshold));
      const bPass = compareWithComparator(sum, sideB.comparator, Number(sideB.threshold));
      let newStatus = 'push';
      if (aPass && !bPass) newStatus = 'gradedA';
      else if (bPass && !aPass) newStatus = 'gradedB';
      else newStatus = 'push';
      const propResult = `sum(${metrics.join('+')})=${sum}`;

      if (!dryRun) {
        await base('Props').update([
          { id: airtableId, fields: { propStatus: newStatus, gradedAt: new Date().toISOString(), propResult } },
        ]);
      }
      const elapsedMs = Date.now() - startedAt;
      console.log('[gradePropByFormula] Completed player_multi_stat_ou', { airtableId, newStatus, dryRun, elapsedMs });
      return res.status(200).json({ success: true, propStatus: newStatus, propResult, meta: { elapsedMs, dryRun } });
    }

    if (formulaKey === 'team_stat_over_under') {
      const espnGameID = String(params?.espnGameID || '').trim();
      const gameDate = String(params?.gameDate || '').trim();
      const entity = String(params?.entity || 'team').toLowerCase();
      const metricRaw = String(params?.metric || '').trim();
      const sides = params?.sides || {};
      const sideA = sides?.A || {};
      const sideB = sides?.B || {};
      const teamAbv = String(params?.teamAbv || '').toUpperCase();
      if (!espnGameID || !gameDate || !metricRaw || !teamAbv || !sideA?.comparator || sideA?.threshold == null || !sideB?.comparator || sideB?.threshold == null) {
        return res.status(400).json({ success: false, error: 'Missing required params for team_stat_over_under (espnGameID, gameDate, metric, teamAbv, sides.A/B comparator+threshold)' });
      }
      if (entity !== 'team') {
        return res.status(400).json({ success: false, error: 'team_stat_over_under supports entity=team only' });
      }

      // Map aliases to normalized keys
      const mLc = metricRaw.toLowerCase();
      const metric = (mLc === 'hits' || mLc === 'h') ? 'H'
        : (mLc === 'runs' || mLc === 'r') ? 'R'
        : (mLc === 'errors' || mLc === 'e') ? 'E'
        : metricRaw;

      // Try scoreboard line score first
      let value = undefined;
      try {
        const src = resolveSourceConfig('major-mlb');
        if (!src.ok) throw new Error(src.error || 'Major MLB source not configured');
        const yyyy = gameDate.slice(0, 4);
        const mm = gameDate.slice(4, 6);
        const dd = gameDate.slice(6, 8);
        const url = new URL(`https://${src.host}${src.endpoints.scoreboard}`);
        url.searchParams.set('year', yyyy);
        url.searchParams.set('month', mm);
        url.searchParams.set('day', dd);
        const upstream = await fetch(url.toString(), { method: 'GET', headers: src.headers });
        const data = await upstream.json().catch(() => ({}));
        const raw = data?.body || data || {};
        const games = normalizeMajorMlbScoreboard(raw) || [];
        const game = games.find((g) => String(g?.id || '').trim() === espnGameID);
        if (game) {
          const side = (teamAbv === game.away) ? 'away' : 'home';
          value = Number(game?.lineScore?.[side]?.[metric]);
        }
      } catch {}

      // Fallback: sum from boxscore players if not available
      if (!Number.isFinite(value)) {
        try {
          const { playersById } = await fetchMajorMlbBoxscorePlayers(espnGameID);
          let total = 0;
          for (const p of Object.values(playersById || {})) {
            if (String(p?.teamAbv || '').toUpperCase() !== teamAbv) continue;
            const v = Number(p?.stats?.[metric] ?? p?.stats?.[mLc]);
            if (Number.isFinite(v)) total += v;
          }
          value = total;
        } catch {}
      }

      if (!Number.isFinite(value)) {
        return res.status(409).json({ success: false, error: `Metric ${metricRaw} not available for team ${teamAbv}` });
      }

      const aPass = compareWithComparator(value, sideA.comparator, Number(sideA.threshold));
      const bPass = compareWithComparator(value, sideB.comparator, Number(sideB.threshold));
      let newStatus = 'push';
      if (aPass && !bPass) newStatus = 'gradedA';
      else if (bPass && !aPass) newStatus = 'gradedB';
      else newStatus = 'push';
      const propResult = `team ${teamAbv} ${metric}=${value}`;

      if (!dryRun) {
        await base('Props').update([
          { id: airtableId, fields: { propStatus: newStatus, gradedAt: new Date().toISOString(), propResult } },
        ]);
      }

      const elapsedMs = Date.now() - startedAt;
      console.log('[gradePropByFormula] Completed team_stat_over_under', { airtableId, newStatus, dryRun, elapsedMs });
      return res.status(200).json({ success: true, propStatus: newStatus, propResult, meta: { elapsedMs, dryRun } });
    }

    if (formulaKey === 'team_stat_h2h') {
      const espnGameID = String(params?.espnGameID || '').trim();
      const gameDate = String(params?.gameDate || '').trim();
      const metric = String(params?.metric || '').trim();
      const teamAbvA = String(params?.teamAbvA || '').toUpperCase();
      const teamAbvB = String(params?.teamAbvB || '').toUpperCase();
      const winnerRule = String(params?.winnerRule || 'higher').toLowerCase();
      if (!espnGameID || !gameDate || !metric || !teamAbvA || !teamAbvB) {
        return res.status(400).json({ success: false, error: 'Missing required params for team_stat_h2h (espnGameID, gameDate, metric, teamAbvA, teamAbvB)' });
      }

      const src = resolveSourceConfig('major-mlb');
      if (!src.ok) throw new Error(src.error || 'Major MLB source not configured');
      const yyyy = gameDate.slice(0, 4);
      const mm = gameDate.slice(4, 6);
      const dd = gameDate.slice(6, 8);
      const url = new URL(`https://${src.host}${src.endpoints.scoreboard}`);
      url.searchParams.set('year', yyyy);
      url.searchParams.set('month', mm);
      url.searchParams.set('day', dd);
      const upstream = await fetch(url.toString(), { method: 'GET', headers: src.headers });
      const data = await upstream.json().catch(() => ({}));
      const raw = data?.body || data || {};
      const games = normalizeMajorMlbScoreboard(raw) || [];
      const game = games.find((g) => String(g?.id || '').trim() === espnGameID);
      if (!game) {
        return res.status(404).json({ success: false, error: `Game not found for espnGameID=${espnGameID} on ${gameDate}` });
      }

      // Map common aliases to normalized scoreboard keys
      const mLc = metric.toLowerCase();
      const metricKey = (mLc === 'hits' || mLc === 'h') ? 'H'
        : (mLc === 'runs' || mLc === 'r') ? 'R'
        : (mLc === 'errors' || mLc === 'e') ? 'E'
        : metric;

      let valueA = Number(game?.lineScore?.[teamAbvA === game.away ? 'away' : 'home']?.[metricKey]);
      let valueB = Number(game?.lineScore?.[teamAbvB === game.away ? 'away' : 'home']?.[metricKey]);
      if (!Number.isFinite(valueA) || !Number.isFinite(valueB)) {
        // Fallback: sum player stats by team from boxscore
        try {
          const { playersById } = await fetchMajorMlbBoxscorePlayers(espnGameID);
          const sumFor = (teamAbv) => {
            let total = 0;
            for (const p of Object.values(playersById || {})) {
              if (String(p.teamAbv || '').toUpperCase() !== teamAbv) continue;
              // Map common aliases at player level too
              const v = Number(p?.stats?.[metricKey] ?? p?.stats?.[metric] ?? p?.stats?.[mLc]);
              if (Number.isFinite(v)) total += v;
            }
            return total;
          };
          valueA = sumFor(teamAbvA);
          valueB = sumFor(teamAbvB);
        } catch {}
      }
      if (!Number.isFinite(valueA) || !Number.isFinite(valueB)) {
        return res.status(409).json({ success: false, error: `Metric ${metric} not available for teams ${teamAbvA} vs ${teamAbvB}` });
      }

      let newStatus = 'push';
      if (winnerRule === 'lower') {
        if (valueA < valueB) newStatus = 'gradedA';
        else if (valueB < valueA) newStatus = 'gradedB';
        else newStatus = 'push';
      } else {
        if (valueA > valueB) newStatus = 'gradedA';
        else if (valueB > valueA) newStatus = 'gradedB';
        else newStatus = 'push';
      }
      const propResult = `A:${teamAbvA} ${metricKey}=${valueA} vs B:${teamAbvB} ${metricKey}=${valueB}`;

      if (!dryRun) {
        await base('Props').update([
          { id: airtableId, fields: { propStatus: newStatus, gradedAt: new Date().toISOString(), propResult } },
        ]);
      }
      const elapsedMs = Date.now() - startedAt;
      console.log('[gradePropByFormula] Completed team_stat_h2h', { airtableId, newStatus, dryRun, elapsedMs });
      return res.status(200).json({ success: true, propStatus: newStatus, propResult, meta: { elapsedMs, dryRun } });
    }

    return res.status(400).json({ success: false, error: `Unsupported formula: ${formulaKey || 'unknown'}` });
  } catch (e) {
    console.error('[gradePropByFormula] Error', e?.message || e);
    return res.status(500).json({ success: false, error: e.message || 'Unknown error' });
  }
}


