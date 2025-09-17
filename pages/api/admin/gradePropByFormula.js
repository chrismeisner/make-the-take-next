import { getToken } from 'next-auth/jwt';
import { resolveSourceConfig } from '../../../lib/apiSources';
import { normalizeMajorMlbScoreboard, normalizeNflScoreboardFromWeekly } from '../../../lib/normalize';
import { getDataBackend } from '../../../lib/runtimeConfig';
import { query } from '../../../lib/db/postgres';

// Airtable removed; Postgres-only implementation

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

// ESPN NFL weekly scoreboard (source of truth for team points)
async function fetchEspnNflScoreboardWeekly(yearInput, weekInput) {
  const year = String(yearInput || new Date().getFullYear());
  const week = String(weekInput || 1);
  const url = new URL('https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard');
  url.searchParams.set('year', year);
  url.searchParams.set('week', week);
  const resp = await fetch(url.toString(), { method: 'GET' });
  const data = await resp.json().catch(() => ({}));
  return normalizeNflScoreboardFromWeekly(data) || [];
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
  const overrideFormulaKey = String(body?.overrideFormulaKey || body?.formulaKey || '').toLowerCase();
  console.log('[gradePropByFormula] Incoming request', {
    method,
    airtableId,
    dryRun,
    overrideParamKeys: Object.keys(overrideParams || {}),
    ua: req.headers['user-agent'] || '',
    referer: req.headers['referer'] || '',
  });

  // Postgres path: load prop by UUID or text prop_id; compute and update prop_status
  if (getDataBackend() === 'postgres') {
    try {
      if (!airtableId) {
        return res.status(400).json({ success: false, error: 'Missing airtableId' });
      }
      // Load prop with joined event info
      const { rows } = await query(
        `SELECT p.*, e.espn_game_id, e.event_time, e.league, e.week
           FROM props p
      LEFT JOIN events e ON e.id = p.event_id
          WHERE p.id::text = $1 OR p.prop_id = $1
          LIMIT 1`,
        [airtableId]
      );
      if (!rows || rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Prop not found' });
      }
      const r = rows[0];
      const gradingMode = String(r.grading_mode || '').toLowerCase();
      const formulaKey = overrideFormulaKey || String(r.formula_key || '').toLowerCase();
      let params = {};
      try {
        const raw = r.formula_params;
        params = raw && typeof raw === 'string' ? JSON.parse(raw) : (raw || {});
      } catch {}
      params = { ...(params || {}), ...(overrideParams || {}) };

      if (gradingMode !== 'auto') {
        if (!dryRun) {
          return res.status(400).json({ success: false, error: 'Prop is not set to auto grading' });
        }
        // Allow dryRun previews when an overrideFormulaKey is provided
        if (!overrideFormulaKey) {
          return res.status(400).json({ success: false, error: 'Prop is not set to auto grading (provide overrideFormulaKey for preview)' });
        }
      }

      // Helpers shared with AT path
      const finish = async (newStatus, propResult) => {
        if (!dryRun) {
          const gradedAt = ['gradeda','gradedb','push'].includes(String(newStatus).toLowerCase()) ? new Date().toISOString() : null;
          // 1) Update prop row
          await query(
            'UPDATE props SET prop_status = $1, prop_result = $2, graded_at = COALESCE($3, graded_at), updated_at = NOW() WHERE id::text = $4 OR prop_id = $4',
            [newStatus, propResult || null, gradedAt, airtableId]
          );
          // 2) Update take_result for all latest takes on this prop
          //    won if side matches gradedA/B, lost otherwise; push -> push; other -> pending
          await query(
            `UPDATE takes t
               SET take_result = CASE
                 WHEN $1 IN ('gradedA','gradedB') THEN CASE
                   WHEN $1 = 'gradedA' AND t.prop_side = 'A' THEN 'won'
                   WHEN $1 = 'gradedB' AND t.prop_side = 'B' THEN 'won'
                   ELSE 'lost'
                 END
                 WHEN $1 = 'push' THEN 'push'
                 ELSE 'pending'
               END
                , take_pts = CASE
                  WHEN $1 = 'gradedA' THEN CASE WHEN t.prop_side = 'A' THEN COALESCE(p.prop_side_a_value, 1) ELSE 0 END
                  WHEN $1 = 'gradedB' THEN CASE WHEN t.prop_side = 'B' THEN COALESCE(p.prop_side_b_value, 1) ELSE 0 END
                  WHEN $1 = 'push' THEN 100
                  ELSE 0
                END
                , tokens = (CASE
                  WHEN $1 = 'gradedA' THEN CASE WHEN t.prop_side = 'A' THEN COALESCE(p.prop_side_a_value, 1) ELSE 0 END
                  WHEN $1 = 'gradedB' THEN CASE WHEN t.prop_side = 'B' THEN COALESCE(p.prop_side_b_value, 1) ELSE 0 END
                  WHEN $1 = 'push' THEN 100
                  ELSE 0
                END) * 0.05
             FROM props p
            WHERE t.prop_id = p.id
              AND (p.id::text = $2 OR p.prop_id = $2)
              AND t.take_status = 'latest'`,
            [newStatus, airtableId]
          );
          // 3) If this prop belongs to a pack, check if all props in the pack are graded; if so, mark pack as graded
          try {
            if (r && r.pack_id) {
              const { rows: counts } = await query(
                `SELECT
                   COUNT(*)::int AS total,
                   COUNT(*) FILTER (WHERE LOWER(COALESCE(prop_status,'')) NOT IN ('gradeda','gradedb','push'))::int AS ungraded
                 FROM props
                WHERE pack_id = $1`,
                [r.pack_id]
              );
              const ungraded = counts && counts[0] ? Number(counts[0].ungraded) : 0;
              if (Number.isFinite(ungraded) && ungraded === 0) {
                await query('UPDATE packs SET pack_status = $1 WHERE id = $2', ['graded', r.pack_id]);
              }
            }
          } catch (e) {
            try { console.error('[gradePropByFormula PG] pack graded check failed', e?.message || e); } catch {}
          }
        }
        const elapsedMs = Date.now() - startedAt;
        return res.status(200).json({ success: true, propStatus: newStatus, propResult, meta: { elapsedMs, dryRun } });
      };

      if (formulaKey === 'who_wins') {
        const espnGameID = String(params?.espnGameID || r.espn_game_id || '').trim();
        // Prefer param gameDate; fallback to event_time
        let gameDate = String(params?.gameDate || '').trim();
        if (!gameDate && r.event_time) {
          try {
            const d = new Date(r.event_time);
            const yr = d.getFullYear();
            const mo = String(d.getMonth() + 1).padStart(2, '0');
            const da = String(d.getDate()).padStart(2, '0');
            gameDate = `${yr}${mo}${da}`;
          } catch {}
        }
        const sideAMap = String(params?.whoWins?.sideAMap || '').toLowerCase();
        const sideBMap = String(params?.whoWins?.sideBMap || '').toLowerCase();
        if (!espnGameID || !gameDate || !sideAMap || !sideBMap) {
          return res.status(400).json({ success: false, error: 'Missing required params for who_wins (espnGameID, gameDate, whoWins.sideAMap, whoWins.sideBMap)' });
        }
        // Determine data source: prefer event league from DB; fallback to params
        const eventLeagueLc = String(r.league || '').toLowerCase();
        let ds = eventLeagueLc === 'nfl' ? 'nfl' : (eventLeagueLc === 'mlb' ? 'major-mlb' : null);
        if (!ds) {
          const leagueHint = String(params?.dataSource || params?.league || '').toLowerCase().trim();
          ds = (leagueHint.includes('nfl') || leagueHint.includes('football')) ? 'nfl' : 'major-mlb';
        }
        try { console.log('[gradePropByFormula PG] who_wins leagueHint ->', { leagueHint, ds, gameDate, espnGameID }); } catch {}
        let winnerSide = 'push';
        let propResult = '';
        if (ds === 'major-mlb') {
          const src = resolveSourceConfig('major-mlb');
          if (!src.ok) return res.status(500).json({ success: false, error: 'Major MLB source not configured' });
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
          if (!game) return res.status(404).json({ success: false, error: `Game not found for espnGameID=${espnGameID} on ${gameDate}` });
          const homeR = Number(game?.lineScore?.home?.R ?? NaN);
          const awayR = Number(game?.lineScore?.away?.R ?? NaN);
          if (!Number.isFinite(homeR) || !Number.isFinite(awayR)) {
            return res.status(409).json({ success: false, error: 'Score not available yet. Try again later.' });
          }
          winnerSide = homeR > awayR ? 'home' : (awayR > homeR ? 'away' : 'push');
          propResult = `${game.home} ${homeR} - ${awayR} ${game.away}`;
        } else {
          // NFL: prefer weekly scoreboard for points; fallback to boxscore team statistics
          const yyyy = String(params?.nflYear || (r.event_time ? new Date(r.event_time).getFullYear() : new Date().getFullYear()));
          const wk = String(params?.nflWeek || r.week || 1);
          let homePts = NaN, awayPts = NaN, homeAbv = 'HOME', awayAbv = 'AWAY';
          try {
            const games = await fetchEspnNflScoreboardWeekly(yyyy, wk);
            const game = games.find((g) => String(g?.id || '').trim() === espnGameID);
            if (game) {
              homePts = Number(game?.lineScore?.home?.R);
              awayPts = Number(game?.lineScore?.away?.R);
              homeAbv = game.home || homeAbv;
              awayAbv = game.away || awayAbv;
            }
          } catch {}
          if (!Number.isFinite(homePts) || !Number.isFinite(awayPts)) {
            try {
              const src = resolveSourceConfig('nfl');
              if (!src.ok) return res.status(500).json({ success: false, error: 'NFL source not configured' });
              const url = new URL(`https://${src.host}${src.endpoints.boxScore}`);
              url.searchParams.set('id', String(espnGameID));
              const upstream = await fetch(url.toString(), { method: 'GET', headers: src.headers });
              const data = await upstream.json().catch(() => ({}));
              const raw = data?.body || data || {};
              const teams = Array.isArray(raw?.teams) ? raw.teams : [];
              for (const t of teams) {
                const stat = (Array.isArray(t?.statistics) ? t.statistics : []).find(s => String(s?.name || '').toLowerCase() === 'points');
                const v = stat ? Number(stat.value) : NaN;
                if (t.homeAway === 'home' && Number.isFinite(v)) homePts = v;
                if (t.homeAway === 'away' && Number.isFinite(v)) awayPts = v;
              }
            } catch {}
          }
          if (!Number.isFinite(homePts) || !Number.isFinite(awayPts)) {
            return res.status(409).json({ success: false, error: 'Score not available yet. Try again later.' });
          }
          winnerSide = homePts > awayPts ? 'home' : (awayPts > homePts ? 'away' : 'push');
          propResult = `${homeAbv} ${homePts} - ${awayPts} ${awayAbv}`;
        }
        let newStatus = 'push';
        if (winnerSide !== 'push') {
          newStatus = (winnerSide === sideAMap) ? 'gradedA' : (winnerSide === sideBMap) ? 'gradedB' : 'push';
        }
        return await finish(newStatus, propResult);
      }

      if (formulaKey === 'player_multi_stat_ou') {
        const espnGameID = String(params?.espnGameID || r.espn_game_id || '').trim();
        // Prefer param gameDate; fallback to event_time
        let gameDate = String(params?.gameDate || '').trim();
        if (!gameDate && r.event_time) {
          try {
            const d = new Date(r.event_time);
            const yr = d.getFullYear();
            const mo = String(d.getMonth() + 1).padStart(2, '0');
            const da = String(d.getDate()).padStart(2, '0');
            gameDate = `${yr}${mo}${da}`;
          } catch {}
        }
        const metrics = Array.isArray(params?.metrics) ? params.metrics.filter(Boolean) : [];
        const sides = params?.sides || {};
        const sideA = sides?.A || {};
        const sideB = sides?.B || {};
        const playerId = String(params?.playerId || '').trim();
        if (!espnGameID || !gameDate || metrics.length < 2 || !playerId || !sideA?.comparator || sideA?.threshold == null || !sideB?.comparator || sideB?.threshold == null) {
          return res.status(400).json({ success: false, error: 'Missing required params for player_multi_stat_ou (espnGameID, gameDate, metrics[>=2], playerId, sides.A/B comparator+threshold)' });
        }
        // Determine data source: prefer event league; fallback to params
        const eventLeagueLc = String(r.league || '').toLowerCase();
        let ds = eventLeagueLc === 'nfl' ? 'nfl' : (eventLeagueLc === 'mlb' ? 'major-mlb' : null);
        if (!ds) {
          const leagueHint = String(params?.dataSource || params?.league || '').toLowerCase().trim();
          ds = (leagueHint.includes('nfl') || leagueHint.includes('football')) ? 'nfl' : 'major-mlb';
        }
        // Fetch and normalize boxscore players
        let playersById = {};
        if (ds === 'major-mlb') {
          // Reuse the Airtable path MLB normalizer logic inline via helper defined above
          const { playersById: mlbPlayers } = await fetchMajorMlbBoxscorePlayers(espnGameID);
          playersById = mlbPlayers || {};
        } else if (ds === 'nfl') {
          // Mirror normalization approach used in /api/admin/api-tester/boxscore for NFL
          const src = resolveSourceConfig('nfl');
          if (!src.ok) return res.status(500).json({ success: false, error: 'NFL source not configured' });
          const url = new URL(`https://${src.host}${src.endpoints.boxScore}`);
          url.searchParams.set('id', String(espnGameID));
          const upstream = await fetch(url.toString(), { method: 'GET', headers: src.headers });
          const data = await upstream.json().catch(() => ({}));
          const raw = data?.body || data || {};
          // Build players map similar to api-tester normalization
          const map = {};
          try {
            const teamBlocks = Array.isArray(raw?.players) ? raw.players : [];
            for (const teamBlock of teamBlocks) {
              const teamAbv = String(teamBlock?.team?.abbreviation || '').toUpperCase();
              const statGroups = Array.isArray(teamBlock?.statistics) ? teamBlock.statistics : [];
              for (const group of statGroups) {
                const keys = Array.isArray(group?.keys) ? group.keys : [];
                const athletes = Array.isArray(group?.athletes) ? group.athletes : [];
                for (const row of athletes) {
                  const athlete = row?.athlete || {};
                  const id = String(athlete?.id || '').trim();
                  const longName = athlete?.displayName || athlete?.shortName || '';
                  const values = Array.isArray(row?.stats) ? row.stats : [];
                  if (!id && !longName) continue;
                  const playerKey = id || `${teamAbv || 'UNK'}:${longName || 'UNKNOWN'}`;
                  const existing = map[playerKey] || { stats: {} };
                  const stats = { ...existing.stats };
                  const count = Math.min(keys.length, values.length);
                  for (let i = 0; i < count; i++) {
                    const key = String(keys[i]);
                    const val = values[i];
                    const num = (typeof val === 'number') ? val : (typeof val === 'string' && /^[+-]?\d*(?:\.\d+)?$/.test(val.trim()) ? parseFloat(val.trim()) : undefined);
                    if (num !== undefined) stats[key] = num;
                  }
                  map[playerKey] = {
                    id: playerKey,
                    longName: longName || existing.longName || playerKey,
                    teamAbv: teamAbv || existing.teamAbv || '',
                    stats,
                  };
                }
              }
            }
          } catch {}
          playersById = map;
        }
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
        const propResult = `sum(${metrics.join('+')})=${sum}`;
        return await finish(newStatus, propResult);
      }

      if (formulaKey === 'stat_over_under') {
        const espnGameID = String(params?.espnGameID || r.espn_game_id || '').trim();
        let gameDate = String(params?.gameDate || '').trim();
        if (!gameDate && r.event_time) {
          try { gameDate = toYYYYMMDD(r.event_time); } catch {}
        }
        const metric = String(params?.metric || '').trim();
        const sides = params?.sides || {};
        const sideA = sides?.A || {};
        const sideB = sides?.B || {};
        const entity = String(params?.entity || 'player').toLowerCase();
        if (!espnGameID || !gameDate || !metric || !sideA?.comparator || sideA?.threshold == null || !sideB?.comparator || sideB?.threshold == null) {
          return res.status(400).json({ success: false, error: 'Missing required params for stat_over_under (espnGameID, gameDate, metric, sides.A/B comparator+threshold)' });
        }
        const eventLeagueLc = String(r.league || '').toLowerCase();
        let ds = eventLeagueLc === 'nfl' ? 'nfl' : (eventLeagueLc === 'mlb' ? 'major-mlb' : null);
        if (!ds) {
          const leagueHint = String(params?.dataSource || params?.league || '').toLowerCase().trim();
          ds = (leagueHint.includes('nfl') || leagueHint.includes('football')) ? 'nfl' : 'major-mlb';
        }
        let valueNumber = NaN;
        if (entity === 'player') {
          // Player single stat
          let playersById = {};
          if (ds === 'major-mlb') {
            const resp = await fetchMajorMlbBoxscorePlayers(espnGameID);
            playersById = resp?.playersById || {};
          } else {
            // NFL: normalize players from boxscore
            const src = resolveSourceConfig('nfl');
            if (!src.ok) return res.status(500).json({ success: false, error: 'NFL source not configured' });
            const url = new URL(`https://${src.host}${src.endpoints.boxScore}`);
            url.searchParams.set('id', String(espnGameID));
            const upstream = await fetch(url.toString(), { method: 'GET', headers: src.headers });
            const data = await upstream.json().catch(() => ({}));
            const raw = data?.body || data || {};
            const map = {};
            try {
              const teamBlocks = Array.isArray(raw?.players) ? raw.players : [];
              for (const teamBlock of teamBlocks) {
                const teamAbv = String(teamBlock?.team?.abbreviation || '').toUpperCase();
                const statGroups = Array.isArray(teamBlock?.statistics) ? teamBlock.statistics : [];
                for (const group of statGroups) {
                  const keys = Array.isArray(group?.keys) ? group.keys : [];
                  const athletes = Array.isArray(group?.athletes) ? group.athletes : [];
                  for (const row of athletes) {
                    const athlete = row?.athlete || {};
                    const id = String(athlete?.id || '').trim();
                    const longName = athlete?.displayName || athlete?.shortName || '';
                    const values = Array.isArray(row?.stats) ? row.stats : [];
                    if (!id && !longName) continue;
                    const playerKey = id || `${teamAbv || 'UNK'}:${longName || 'UNKNOWN'}`;
                    const existing = map[playerKey] || { stats: {} };
                    const stats = { ...existing.stats };
                    const count = Math.min(keys.length, values.length);
                    for (let i = 0; i < count; i++) {
                      const key = String(keys[i]);
                      const val = values[i];
                      const num = (typeof val === 'number') ? val : (typeof val === 'string' && /^[+-]?\d*(?:\.\d+)?$/.test(val.trim()) ? parseFloat(val.trim()) : undefined);
                      if (num !== undefined) stats[key] = num;
                    }
                    map[playerKey] = { id: playerKey, longName: longName || playerKey, teamAbv, stats };
                  }
                }
              }
            } catch {}
            playersById = map;
          }
          const playerId = String(params?.playerId || '').trim();
          if (!playerId) return res.status(400).json({ success: false, error: 'Missing playerId for stat_over_under (entity=player)' });
          const player = playersById?.[playerId];
          valueNumber = Number(player?.stats?.[metric]);
        } else {
          // Team single stat (MLB supported; NFL limited to points via scoreboard)
          if (ds === 'major-mlb') {
            try {
              const src = resolveSourceConfig('major-mlb');
              if (!src.ok) throw new Error('MLB source not configured');
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
              if (!game) throw new Error('Game not found');
              const teamAbv = String(params?.teamAbv || '').toUpperCase();
              const mLc = metric.toLowerCase();
              const metricKey = (mLc === 'hits' || mLc === 'h') ? 'H' : (mLc === 'runs' || mLc === 'r') ? 'R' : (mLc === 'errors' || mLc === 'e') ? 'E' : metric;
              const side = (teamAbv === game.away) ? 'away' : 'home';
              valueNumber = Number(game?.lineScore?.[side]?.[metricKey]);
              if (!Number.isFinite(valueNumber)) {
                const { playersById } = await fetchMajorMlbBoxscorePlayers(espnGameID);
                let total = 0;
                for (const p of Object.values(playersById || {})) {
                  if (String(p?.teamAbv || '').toUpperCase() !== teamAbv) continue;
                  const v = Number(p?.stats?.[metricKey] ?? p?.stats?.[metric] ?? p?.stats?.[mLc]);
                  if (Number.isFinite(v)) total += v;
                }
                valueNumber = total;
              }
            } catch {}
          } else {
            // NFL limited: points only from scoreboard weekly
            const src = resolveSourceConfig('nfl');
            if (!src.ok) return res.status(500).json({ success: false, error: 'NFL source not configured' });
            const yyyy = String(params?.nflYear || (r.event_time ? new Date(r.event_time).getFullYear() : new Date().getFullYear()));
            const wk = String(params?.nflWeek || r.week || 1);
            const url = new URL(`https://${src.host}${src.endpoints.scoreboard}`);
            url.searchParams.set('year', yyyy);
            url.searchParams.set('week', wk);
            const upstream = await fetch(url.toString(), { method: 'GET', headers: src.headers });
            const data = await upstream.json().catch(() => ({}));
            const raw = data?.body || data || {};
            const games = normalizeNflScoreboardFromWeekly(raw) || [];
            const game = games.find((g) => String(g?.id || g?.gameID || g?.gameId || '').trim() === espnGameID);
            if (game) {
              const teamAbv = String(params?.teamAbv || '').toUpperCase();
              const side = (teamAbv === game.away) ? 'away' : 'home';
              if (metric.toLowerCase() === 'points') {
                valueNumber = Number(game?.lineScore?.[side]?.R);
              }
            }
          }
        }
        if (!Number.isFinite(valueNumber)) {
          return res.status(409).json({ success: false, error: `Metric ${metric} not available` });
        }
        const aPass = compareWithComparator(valueNumber, sideA.comparator, Number(sideA.threshold));
        const bPass = compareWithComparator(valueNumber, sideB.comparator, Number(sideB.threshold));
        let newStatus = 'push';
        if (aPass && !bPass) newStatus = 'gradedA';
        else if (bPass && !aPass) newStatus = 'gradedB';
        const propResult = `${entity} ${metric}=${valueNumber}`;
        return await finish(newStatus, propResult);
      }

      if (formulaKey === 'player_h2h') {
        const espnGameID = String(params?.espnGameID || r.espn_game_id || '').trim();
        let gameDate = String(params?.gameDate || '').trim();
        if (!gameDate && r.event_time) { try { gameDate = toYYYYMMDD(r.event_time); } catch {} }
        const metric = String(params?.metric || '').trim();
        const playerAId = String(params?.playerAId || '').trim();
        const playerBId = String(params?.playerBId || '').trim();
        const winnerRule = String(params?.winnerRule || 'higher').toLowerCase();
        if (!espnGameID || !gameDate || !metric || !playerAId || !playerBId) {
          return res.status(400).json({ success: false, error: 'Missing required params for player_h2h (espnGameID, gameDate, metric, playerAId, playerBId)' });
        }

        // Determine data source by event league; fallback to params hint
        const eventLeagueLc = String(r.league || '').toLowerCase();
        let ds = eventLeagueLc === 'nfl' ? 'nfl' : (eventLeagueLc === 'mlb' ? 'major-mlb' : null);
        if (!ds) {
          const leagueHint = String(params?.dataSource || params?.league || '').toLowerCase().trim();
          ds = (leagueHint.includes('nfl') || leagueHint.includes('football')) ? 'nfl' : 'major-mlb';
        }

        let vA = NaN, vB = NaN;
        if (ds === 'nfl') {
          // NFL: normalize players from boxscore
          try {
            const src = resolveSourceConfig('nfl');
            if (!src.ok) return res.status(500).json({ success: false, error: 'NFL source not configured' });
            const url = new URL(`https://${src.host}${src.endpoints.boxScore}`);
            url.searchParams.set('id', String(espnGameID));
            const upstream = await fetch(url.toString(), { method: 'GET', headers: src.headers });
            const data = await upstream.json().catch(() => ({}));
            const raw = data?.body || data || {};
            const map = {};
            try {
              const teamBlocks = Array.isArray(raw?.players) ? raw.players : [];
              for (const teamBlock of teamBlocks) {
                const teamAbv = String(teamBlock?.team?.abbreviation || '').toUpperCase();
                const statGroups = Array.isArray(teamBlock?.statistics) ? teamBlock.statistics : [];
                for (const group of statGroups) {
                  const keys = Array.isArray(group?.keys) ? group.keys : [];
                  const athletes = Array.isArray(group?.athletes) ? group.athletes : [];
                  for (const row of athletes) {
                    const athlete = row?.athlete || {};
                    const id = String(athlete?.id || '').trim();
                    const longName = athlete?.displayName || athlete?.shortName || '';
                    const values = Array.isArray(row?.stats) ? row.stats : [];
                    if (!id && !longName) continue;
                    const playerKey = id || `${teamAbv || 'UNK'}:${longName || 'UNKNOWN'}`;
                    const existing = map[playerKey] || { stats: {} };
                    const stats = { ...existing.stats };
                    const count = Math.min(keys.length, values.length);
                    for (let i = 0; i < count; i++) {
                      const key = String(keys[i]);
                      const val = values[i];
                      const num = (typeof val === 'number') ? val : (typeof val === 'string' && /^[+-]?\d*(?:\.\d+)?$/.test(val.trim()) ? parseFloat(val.trim()) : undefined);
                      if (num !== undefined) stats[key] = num;
                    }
                    map[playerKey] = { id: playerKey, longName: longName || playerKey, teamAbv, stats };
                  }
                }
              }
            } catch {}
            const pA = map?.[playerAId];
            const pB = map?.[playerBId];
            vA = Number(pA?.stats?.[metric]);
            vB = Number(pB?.stats?.[metric]);
          } catch {}
        } else {
          // MLB path (existing)
          const { playersById } = await fetchMajorMlbBoxscorePlayers(espnGameID);
          const pA = playersById?.[playerAId];
          const pB = playersById?.[playerBId];
          vA = Number(pA?.stats?.[metric]);
          vB = Number(pB?.stats?.[metric]);
        }

        if (!Number.isFinite(vA) || !Number.isFinite(vB)) {
          return res.status(409).json({ success: false, error: `Metric ${metric} not available for players` });
        }
        let newStatus = 'push';
        if (winnerRule === 'lower') newStatus = vA < vB ? 'gradedA' : (vB < vA ? 'gradedB' : 'push');
        else newStatus = vA > vB ? 'gradedA' : (vB > vA ? 'gradedB' : 'push');
        const propResult = `A:${playerAId} ${metric}=${vA} vs B:${playerBId} ${metric}=${vB}`;
        return await finish(newStatus, propResult);
      }

      if (formulaKey === 'team_stat_over_under') {
        const espnGameID = String(params?.espnGameID || r.espn_game_id || '').trim();
        let gameDate = String(params?.gameDate || '').trim();
        if (!gameDate && r.event_time) { try { gameDate = toYYYYMMDD(r.event_time); } catch {} }
        const teamAbv = String(params?.teamAbv || '').toUpperCase();
        const metricRaw = String(params?.metric || '').trim();
        const sides = params?.sides || {};
        const sideA = sides?.A || {}; const sideB = sides?.B || {};
        if (!espnGameID || !gameDate || !metricRaw || !teamAbv || !sideA?.comparator || sideA?.threshold == null || !sideB?.comparator || sideB?.threshold == null) {
          return res.status(400).json({ success: false, error: 'Missing required params for team_stat_over_under (espnGameID, gameDate, metric, teamAbv, sides.A/B comparator+threshold)' });
        }

        // Determine data source by event league; fallback to params hint
        const eventLeagueLc = String(r.league || '').toLowerCase();
        let ds = eventLeagueLc === 'nfl' ? 'nfl' : (eventLeagueLc === 'mlb' ? 'major-mlb' : null);
        if (!ds) {
          const leagueHint = String(params?.dataSource || params?.league || '').toLowerCase().trim();
          ds = (leagueHint.includes('nfl') || leagueHint.includes('football')) ? 'nfl' : 'major-mlb';
        }

        const mLc = metricRaw.toLowerCase();
        const metric = (ds === 'major-mlb')
          ? ((mLc === 'hits' || mLc === 'h') ? 'H' : (mLc === 'runs' || mLc === 'r') ? 'R' : (mLc === 'errors' || mLc === 'e') ? 'E' : metricRaw)
          : metricRaw;

        let value = NaN;
        if (ds === 'nfl') {
          // NFL: try team stat from boxscore; fallback to weekly scoreboard for points
          try {
            const src = resolveSourceConfig('nfl');
            if (!src.ok) return res.status(500).json({ success: false, error: 'NFL source not configured' });
            const url = new URL(`https://${src.host}${src.endpoints.boxScore}`);
            url.searchParams.set('id', String(espnGameID));
            const upstream = await fetch(url.toString(), { method: 'GET', headers: src.headers });
            const data = await upstream.json().catch(() => ({}));
            const raw = data?.body || data || {};
            const teams = Array.isArray(raw?.teams) ? raw.teams : [];
            const findTeamStat = (abv) => {
              const t = teams.find(ti => String(ti?.team?.abbreviation || '').toUpperCase() === String(abv).toUpperCase());
              if (!t) return undefined;
              const stats = Array.isArray(t.statistics) ? t.statistics : [];
              const stat = stats.find(s => String(s?.name || '').toLowerCase() === mLc);
              if (!stat) return undefined;
              const v = Number(stat.value);
              if (Number.isFinite(v)) return v;
              const dv = String(stat.displayValue || '').trim();
              const n = parseFloat(dv);
              return Number.isFinite(n) ? n : undefined;
            };
            value = findTeamStat(teamAbv);
          } catch {}
          if (!Number.isFinite(value) && mLc === 'points') {
            try {
              const yyyy = String(params?.nflYear || (r.event_time ? new Date(r.event_time).getFullYear() : new Date().getFullYear()));
              const wk = String(params?.nflWeek || r.week || 1);
              const games = await fetchEspnNflScoreboardWeekly(yyyy, wk);
              const game = games.find((g) => String(g?.id || '').trim() === espnGameID);
              if (game) {
                const side = (teamAbv === game.away) ? 'away' : 'home';
                const pts = Number(game?.lineScore?.[side]?.R);
                if (Number.isFinite(pts)) value = pts;
              }
            } catch {}
          }
        } else {
          // MLB behavior: scoreboard R/H/E, fallback to boxscore sum
          try {
            const src = resolveSourceConfig('major-mlb');
            if (!src.ok) throw new Error('MLB source not configured');
            const yyyy = gameDate.slice(0, 4); const mm = gameDate.slice(4, 6); const dd = gameDate.slice(6, 8);
            const url = new URL(`https://${src.host}${src.endpoints.scoreboard}`);
            url.searchParams.set('year', yyyy); url.searchParams.set('month', mm); url.searchParams.set('day', dd);
            const upstream = await fetch(url.toString(), { method: 'GET', headers: src.headers });
            const data = await upstream.json().catch(() => ({}));
            const raw = data?.body || data || {}; const games = normalizeMajorMlbScoreboard(raw) || [];
            const game = games.find((g) => String(g?.id || '').trim() === espnGameID);
            if (game) {
              const side = (teamAbv === game.away) ? 'away' : 'home';
              value = Number(game?.lineScore?.[side]?.[metric]);
            }
          } catch {}
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
        }

        if (!Number.isFinite(value)) return res.status(409).json({ success: false, error: `Metric ${metricRaw} not available for team ${teamAbv}` });
        const aPass = compareWithComparator(value, sideA.comparator, Number(sideA.threshold));
        const bPass = compareWithComparator(value, sideB.comparator, Number(sideB.threshold));
        let newStatus = 'push'; if (aPass && !bPass) newStatus = 'gradedA'; else if (bPass && !aPass) newStatus = 'gradedB';
        const propResult = `team ${teamAbv} ${metric}=${value}`;
        return await finish(newStatus, propResult);
      }

      if (formulaKey === 'team_stat_h2h') {
        const espnGameID = String(params?.espnGameID || r.espn_game_id || '').trim();
        let gameDate = String(params?.gameDate || '').trim();
        if (!gameDate && r.event_time) { try { gameDate = toYYYYMMDD(r.event_time); } catch {} }
        const metric = String(params?.metric || '').trim();
        const teamAbvA = String(params?.teamAbvA || '').toUpperCase();
        const teamAbvB = String(params?.teamAbvB || '').toUpperCase();
        const winnerRule = String(params?.winnerRule || 'higher').toLowerCase();
        if (!espnGameID || !gameDate || !metric || !teamAbvA || !teamAbvB) {
          return res.status(400).json({ success: false, error: 'Missing required params for team_stat_h2h (espnGameID, gameDate, metric, teamAbvA, teamAbvB)' });
        }

        // Determine data source by event league, fallback to params hint
        const eventLeagueLc = String(r.league || '').toLowerCase();
        let ds = eventLeagueLc === 'nfl' ? 'nfl' : (eventLeagueLc === 'mlb' ? 'major-mlb' : null);
        if (!ds) {
          const leagueHint = String(params?.dataSource || params?.league || '').toLowerCase().trim();
          ds = (leagueHint.includes('nfl') || leagueHint.includes('football')) ? 'nfl' : 'major-mlb';
        }

        if (ds === 'nfl') {
          // NFL path: try team statistics from boxscore first; fallback to weekly scoreboard for points
          try {
            const src = resolveSourceConfig('nfl');
            if (!src.ok) return res.status(500).json({ success: false, error: 'NFL source not configured' });
            const url = new URL(`https://${src.host}${src.endpoints.boxScore}`);
            url.searchParams.set('id', String(espnGameID));
            const upstream = await fetch(url.toString(), { method: 'GET', headers: src.headers });
            const data = await upstream.json().catch(() => ({}));
            const raw = data?.body || data || {};
            const teams = Array.isArray(raw?.teams) ? raw.teams : [];
            const mLc = metric.toLowerCase();
            const findTeamStat = (abv) => {
              const t = teams.find(ti => String(ti?.team?.abbreviation || '').toUpperCase() === String(abv).toUpperCase());
              if (!t) return undefined;
              const stats = Array.isArray(t.statistics) ? t.statistics : [];
              const stat = stats.find(s => String(s?.name || '').toLowerCase() === mLc);
              if (!stat) return undefined;
              const v = Number(stat.value);
              if (Number.isFinite(v)) return v;
              const dv = String(stat.displayValue || '').trim();
              const n = parseFloat(dv);
              return Number.isFinite(n) ? n : undefined;
            };
            let valueA = findTeamStat(teamAbvA);
            let valueB = findTeamStat(teamAbvB);
            // Fallback specifically for points via ESPN weekly scoreboard as source of truth
            if ((!Number.isFinite(valueA) || !Number.isFinite(valueB)) && mLc === 'points') {
              const yyyy = String(params?.nflYear || (r.event_time ? new Date(r.event_time).getFullYear() : new Date().getFullYear()));
              const wk = String(params?.nflWeek || r.week || 1);
              const games = await fetchEspnNflScoreboardWeekly(yyyy, wk);
              const game = games.find((g) => String(g?.id || '').trim() === espnGameID);
              if (game) {
                const sideOf = (abv) => (abv === game.away ? 'away' : 'home');
                const altA = Number(game?.lineScore?.[sideOf(teamAbvA)]?.R);
                const altB = Number(game?.lineScore?.[sideOf(teamAbvB)]?.R);
                valueA = Number.isFinite(valueA) ? valueA : altA;
                valueB = Number.isFinite(valueB) ? valueB : altB;
              }
            }
            if (!Number.isFinite(valueA) || !Number.isFinite(valueB)) {
              return res.status(409).json({ success: false, error: `Metric ${metric} not available for teams ${teamAbvA} vs ${teamAbvB}` });
            }
            let newStatus = 'push';
            if (winnerRule === 'lower') newStatus = valueA < valueB ? 'gradedA' : (valueB < valueA ? 'gradedB' : 'push');
            else newStatus = valueA > valueB ? 'gradedA' : (valueB > valueA ? 'gradedB' : 'push');
            const propResult = `A:${teamAbvA} ${mLc}=${valueA} vs B:${teamAbvB} ${mLc}=${valueB}`;
            return await finish(newStatus, propResult);
          } catch (e) {
            console.error('[gradePropByFormula PG] team_stat_h2h NFL error', e?.message || e);
            return res.status(500).json({ success: false, error: 'NFL H2H grading failed' });
          }
        }

        // MLB path (existing)
        const src = resolveSourceConfig('major-mlb');
        if (!src.ok) return res.status(500).json({ success: false, error: 'Major MLB source not configured' });
        const yyyy = gameDate.slice(0, 4); const mm = gameDate.slice(4, 6); const dd = gameDate.slice(6, 8);
        const url = new URL(`https://${src.host}${src.endpoints.scoreboard}`);
        url.searchParams.set('year', yyyy); url.searchParams.set('month', mm); url.searchParams.set('day', dd);
        const upstream = await fetch(url.toString(), { method: 'GET', headers: src.headers });
        const data = await upstream.json().catch(() => ({}));
        const raw = data?.body || data || {}; const games = normalizeMajorMlbScoreboard(raw) || [];
        const game = games.find((g) => String(g?.id || '').trim() === espnGameID);
        if (!game) return res.status(404).json({ success: false, error: `Game not found for espnGameID=${espnGameID} on ${gameDate}` });
        const mLc = metric.toLowerCase();
        const metricKey = (mLc === 'hits' || mLc === 'h') ? 'H' : (mLc === 'runs' || mLc === 'r') ? 'R' : (mLc === 'errors' || mLc === 'e') ? 'E' : metric;
        const sideOf = (abv) => (abv === game.away ? 'away' : 'home');
        let valueA = Number(game?.lineScore?.[sideOf(teamAbvA)]?.[metricKey]);
        let valueB = Number(game?.lineScore?.[sideOf(teamAbvB)]?.[metricKey]);
        if (!Number.isFinite(valueA) || !Number.isFinite(valueB)) {
          // Fallback: sum player stats by team from boxscore
          try {
            const { playersById } = await fetchMajorMlbBoxscorePlayers(espnGameID);
            const sumFor = (teamAbv) => {
              let total = 0; for (const p of Object.values(playersById || {})) { if (String(p.teamAbv || '').toUpperCase() !== teamAbv) continue; const v = Number(p?.stats?.[metricKey] ?? p?.stats?.[metric] ?? p?.stats?.[mLc]); if (Number.isFinite(v)) total += v; } return total;
            };
            valueA = sumFor(teamAbvA); valueB = sumFor(teamAbvB);
          } catch {}
        }
        if (!Number.isFinite(valueA) || !Number.isFinite(valueB)) return res.status(409).json({ success: false, error: `Metric ${metric} not available for teams ${teamAbvA} vs ${teamAbvB}` });
        let newStatus = 'push';
        if (winnerRule === 'lower') newStatus = valueA < valueB ? 'gradedA' : (valueB < valueA ? 'gradedB' : 'push');
        else newStatus = valueA > valueB ? 'gradedA' : (valueB > valueA ? 'gradedB' : 'push');
        const propResult = `A:${teamAbvA} ${metricKey}=${valueA} vs B:${teamAbvB} ${metricKey}=${valueB}`;
        return await finish(newStatus, propResult);
      }

      if (formulaKey === 'player_multi_stat_h2h') {
        const espnGameID = String(params?.espnGameID || r.espn_game_id || '').trim();
        let gameDate = String(params?.gameDate || '').trim();
        if (!gameDate && r.event_time) { try { gameDate = toYYYYMMDD(r.event_time); } catch {} }
        const metrics = Array.isArray(params?.metrics) ? params.metrics.filter(Boolean) : [];
        const playerAId = String(params?.playerAId || '').trim();
        const playerBId = String(params?.playerBId || '').trim();
        const winnerRule = String(params?.winnerRule || 'higher').toLowerCase();
        if (!espnGameID || !gameDate || metrics.length < 2 || !playerAId || !playerBId) {
          return res.status(400).json({ success: false, error: 'Missing required params for player_multi_stat_h2h (espnGameID, gameDate, metrics[>=2], playerAId, playerBId)' });
        }

        // Determine data source
        const eventLeagueLc = String(r.league || '').toLowerCase();
        let ds = eventLeagueLc === 'nfl' ? 'nfl' : (eventLeagueLc === 'mlb' ? 'major-mlb' : null);
        if (!ds) {
          const leagueHint = String(params?.dataSource || params?.league || '').toLowerCase().trim();
          ds = (leagueHint.includes('nfl') || leagueHint.includes('football')) ? 'nfl' : 'major-mlb';
        }

        let sumA = 0, sumB = 0;
        if (ds === 'nfl') {
          // NFL: build players map from boxscore and sum metrics
          try {
            const src = resolveSourceConfig('nfl');
            if (!src.ok) return res.status(500).json({ success: false, error: 'NFL source not configured' });
            const url = new URL(`https://${src.host}${src.endpoints.boxScore}`);
            url.searchParams.set('id', String(espnGameID));
            const upstream = await fetch(url.toString(), { method: 'GET', headers: src.headers });
            const data = await upstream.json().catch(() => ({}));
            const raw = data?.body || data || {};
            const map = {};
            try {
              const teamBlocks = Array.isArray(raw?.players) ? raw.players : [];
              for (const teamBlock of teamBlocks) {
                const teamAbv = String(teamBlock?.team?.abbreviation || '').toUpperCase();
                const statGroups = Array.isArray(teamBlock?.statistics) ? teamBlock.statistics : [];
                for (const group of statGroups) {
                  const keys = Array.isArray(group?.keys) ? group.keys : [];
                  const athletes = Array.isArray(group?.athletes) ? group.athletes : [];
                  for (const row of athletes) {
                    const athlete = row?.athlete || {};
                    const id = String(athlete?.id || '').trim();
                    const longName = athlete?.displayName || athlete?.shortName || '';
                    const values = Array.isArray(row?.stats) ? row.stats : [];
                    if (!id && !longName) continue;
                    const playerKey = id || `${teamAbv || 'UNK'}:${longName || 'UNKNOWN'}`;
                    const existing = map[playerKey] || { stats: {} };
                    const stats = { ...existing.stats };
                    const count = Math.min(keys.length, values.length);
                    for (let i = 0; i < count; i++) {
                      const key = String(keys[i]);
                      const val = values[i];
                      const num = (typeof val === 'number') ? val : (typeof val === 'string' && /^[+-]?\d*(?:\.\d+)?$/.test(val.trim()) ? parseFloat(val.trim()) : undefined);
                      if (num !== undefined) stats[key] = num;
                    }
                    map[playerKey] = { id: playerKey, longName: longName || playerKey, teamAbv, stats };
                  }
                }
              }
            } catch {}
            const pA = map?.[playerAId];
            const pB = map?.[playerBId];
            for (const k of metrics) {
              const vA = Number(pA?.stats?.[k]); if (Number.isFinite(vA)) sumA += vA;
              const vB = Number(pB?.stats?.[k]); if (Number.isFinite(vB)) sumB += vB;
            }
          } catch {}
        } else {
          // MLB: use normalized MLB players
          const { playersById } = await fetchMajorMlbBoxscorePlayers(espnGameID);
          const pA = playersById?.[playerAId];
          const pB = playersById?.[playerBId];
          for (const k of metrics) {
            const vA = Number(pA?.stats?.[k]); if (Number.isFinite(vA)) sumA += vA;
            const vB = Number(pB?.stats?.[k]); if (Number.isFinite(vB)) sumB += vB;
          }
        }

        let newStatus = 'push';
        if (winnerRule === 'lower') newStatus = sumA < sumB ? 'gradedA' : (sumB < sumA ? 'gradedB' : 'push');
        else newStatus = sumA > sumB ? 'gradedA' : (sumB > sumA ? 'gradedB' : 'push');
        const propResult = `A:${playerAId} sum=${sumA} vs B:${playerBId} sum=${sumB}`;
        return await finish(newStatus, propResult);
      }

      if (formulaKey === 'team_multi_stat_ou') {
        const espnGameID = String(params?.espnGameID || r.espn_game_id || '').trim();
        let gameDate = String(params?.gameDate || '').trim();
        if (!gameDate && r.event_time) { try { gameDate = toYYYYMMDD(r.event_time); } catch {} }
        const metrics = Array.isArray(params?.metrics) ? params.metrics.filter(Boolean) : [];
        const teamAbv = String(params?.teamAbv || '').toUpperCase();
        const sides = params?.sides || {}; const sideA = sides?.A || {}; const sideB = sides?.B || {};
        if (!espnGameID || !gameDate || metrics.length < 2 || !teamAbv || !sideA?.comparator || sideA?.threshold == null || !sideB?.comparator || sideB?.threshold == null) {
          return res.status(400).json({ success: false, error: 'Missing required params for team_multi_stat_ou (espnGameID, gameDate, metrics[>=2], teamAbv, sides.A/B comparator+threshold)' });
        }
        const { playersById } = await fetchMajorMlbBoxscorePlayers(espnGameID);
        let total = 0;
        for (const p of Object.values(playersById || {})) {
          if (String(p?.teamAbv || '').toUpperCase() !== teamAbv) continue;
          for (const k of metrics) {
            const v = Number(p?.stats?.[k]); if (Number.isFinite(v)) total += v;
          }
        }
        const aPass = compareWithComparator(total, sideA.comparator, Number(sideA.threshold));
        const bPass = compareWithComparator(total, sideB.comparator, Number(sideB.threshold));
        let newStatus = 'push'; if (aPass && !bPass) newStatus = 'gradedA'; else if (bPass && !aPass) newStatus = 'gradedB';
        const propResult = `team ${teamAbv} sum(${metrics.join('+')})=${total}`;
        return await finish(newStatus, propResult);
      }

      if (formulaKey === 'team_multi_stat_h2h') {
        const espnGameID = String(params?.espnGameID || r.espn_game_id || '').trim();
        let gameDate = String(params?.gameDate || '').trim();
        if (!gameDate && r.event_time) { try { gameDate = toYYYYMMDD(r.event_time); } catch {} }
        const metrics = Array.isArray(params?.metrics) ? params.metrics.filter(Boolean) : [];
        const teamAbvA = String(params?.teamAbvA || '').toUpperCase();
        const teamAbvB = String(params?.teamAbvB || '').toUpperCase();
        const winnerRule = String(params?.winnerRule || 'higher').toLowerCase();
        if (!espnGameID || !gameDate || metrics.length < 2 || !teamAbvA || !teamAbvB) {
          return res.status(400).json({ success: false, error: 'Missing required params for team_multi_stat_h2h (espnGameID, gameDate, metrics[>=2], teamAbvA, teamAbvB)' });
        }
        const { playersById } = await fetchMajorMlbBoxscorePlayers(espnGameID);
        const sumFor = (teamAbv) => {
          let total = 0;
          for (const p of Object.values(playersById || {})) {
            if (String(p?.teamAbv || '').toUpperCase() !== teamAbv) continue;
            for (const k of metrics) { const v = Number(p?.stats?.[k]); if (Number.isFinite(v)) total += v; }
          }
          return total;
        };
        const vA = sumFor(teamAbvA); const vB = sumFor(teamAbvB);
        let newStatus = 'push'; if (winnerRule === 'lower') newStatus = vA < vB ? 'gradedA' : (vB < vA ? 'gradedB' : 'push'); else newStatus = vA > vB ? 'gradedA' : (vB > vA ? 'gradedB' : 'push');
        const propResult = `A:${teamAbvA} sum=${vA} vs B:${teamAbvB} sum=${vB}`;
        return await finish(newStatus, propResult);
      }

      // Unsupported formula in Postgres mode
      return res.status(400).json({ success: false, error: `Unsupported formula in Postgres mode: ${formulaKey || 'unknown'}` });
    } catch (e) {
      console.error('[gradePropByFormula PG] Error', e?.message || e);
      return res.status(500).json({ success: false, error: e.message || 'Unknown error' });
    }
  }

  // Airtable path removed; backend is Postgres-only
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
      // Select source by params.dataSource, default to MLB
      const source = String(params?.dataSource || '').toLowerCase() === 'nfl' ? 'nfl' : 'major-mlb';
      let winnerSide = 'push';
      let propResult = '';
      if (source === 'major-mlb') {
        const src = resolveSourceConfig('major-mlb');
        if (!src.ok) throw new Error(src.error || 'Major MLB source not configured');
        const yyyy = gameDate.slice(0, 4);
        const mm = gameDate.slice(4, 6);
        const dd = gameDate.slice(6, 8);
        const url = new URL(`https://${src.host}${src.endpoints.scoreboard}`);
        url.searchParams.set('year', yyyy);
        url.searchParams.set('month', mm);
        url.searchParams.set('day', dd);
        console.log('[gradePropByFormula] Fetching MLB scoreboard', { url: url.toString(), gameDate, espnGameID });
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
        winnerSide = homeR > awayR ? 'home' : (awayR > homeR ? 'away' : 'push');
        propResult = `${game.home} ${homeR} - ${awayR} ${game.away}`;
      } else if (source === 'nfl') {
        const src = resolveSourceConfig('nfl');
        if (!src.ok) throw new Error(src.error || 'NFL source not configured');
        // NFL scoreboard is weekly; allow caller to optionally provide year/week, else try current week
        const yyyy = String(params?.nflYear || new Date().getFullYear());
        const wk = String(params?.nflWeek || 1);
        const url = new URL(`https://${src.host}${src.endpoints.scoreboard}`);
        url.searchParams.set('year', yyyy);
        url.searchParams.set('week', wk);
        console.log('[gradePropByFormula] Fetching NFL schedule weekly', { url: url.toString(), espnGameID });
        const upstream = await fetch(url.toString(), { method: 'GET', headers: src.headers });
        const data = await upstream.json().catch(() => ({}));
        const raw = data?.body || data || {};
        const games = normalizeNflScoreboardFromWeekly(raw) || [];
        const game = games.find((g) => String(g?.id || '').trim() === espnGameID);
        if (!game) {
          return res.status(404).json({ success: false, error: `NFL game not found for espnGameID=${espnGameID} (year=${yyyy}, week=${wk})` });
        }
        const homeR = Number(game?.lineScore?.home?.R ?? NaN);
        const awayR = Number(game?.lineScore?.away?.R ?? NaN);
        if (!Number.isFinite(homeR) || !Number.isFinite(awayR)) {
          return res.status(409).json({ success: false, error: 'Score not available yet. Try again later.' });
        }
        winnerSide = homeR > awayR ? 'home' : (awayR > homeR ? 'away' : 'push');
        propResult = `${game.home} ${homeR} - ${awayR} ${game.away}`;
      }

      // Map winner to A/B
      let newStatus = 'push';
      if (winnerSide !== 'push') {
        newStatus = (winnerSide === sideAMap) ? 'gradedA' : (winnerSide === sideBMap) ? 'gradedB' : 'push';
      }
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

      // MLB: scoreboard R/H/E then fallback to boxscore sum; NFL: read team stat from nflboxscore
      let value = undefined;
      const leagueLc = String(r.league || '').toLowerCase();
      if (leagueLc === 'mlb') {
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
      } else if (leagueLc === 'nfl') {
        try {
          const src = resolveSourceConfig('nfl');
          if (!src.ok) throw new Error('NFL source not configured');
          const url = new URL(`https://${src.host}${src.endpoints.boxScore}`);
          url.searchParams.set('id', String(espnGameID));
          const upstream = await fetch(url.toString(), { method: 'GET', headers: src.headers });
          const data = await upstream.json().catch(() => ({}));
          const raw = data?.body || data || {};
          const teams = Array.isArray(raw?.teams) ? raw.teams : [];
          const stat = (() => {
            const t = teams.find(ti => String(ti?.team?.abbreviation || '').toUpperCase() === teamAbv);
            if (!t) return undefined;
            return (Array.isArray(t.statistics) ? t.statistics : []).find(s => String(s?.name || '').toLowerCase() === mLc);
          })();
          if (stat) {
            const v = Number(stat.value);
            if (Number.isFinite(v)) value = v; else {
              const dv = String(stat.displayValue || '').trim();
              const n = parseFloat(dv);
              if (Number.isFinite(n)) value = n;
            }
          }
        } catch {}
        // Fallback for team points: use ESPN weekly scoreboard as source of truth
        if (!Number.isFinite(value) && mLc === 'points') {
          try {
            const yyyy = String(params?.nflYear || (r.event_time ? new Date(r.event_time).getFullYear() : new Date().getFullYear()));
            const wk = String(params?.nflWeek || r.week || 1);
            const games = await fetchEspnNflScoreboardWeekly(yyyy, wk);
            const game = games.find((g) => String(g?.id || '').trim() === espnGameID);
            if (game) {
              const side = (teamAbv === game.away) ? 'away' : 'home';
              const pts = Number(game?.lineScore?.[side]?.R);
              if (Number.isFinite(pts)) value = pts;
            }
          } catch {}
        }
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


