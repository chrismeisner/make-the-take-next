import { resolveSourceConfig } from "../../../../lib/apiSources";

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  const { gameID, source: sourceParam } = req.query || {};
  const src = resolveSourceConfig(sourceParam || 'major-mlb');
  if (!src.ok) return res.status(500).json({ success: false, error: src.error || 'Missing RAPIDAPI key/host for source' });
  if (!gameID) {
    return res.status(400).json({ success: false, error: 'Missing gameID query param' });
  }

  try {
    let url;
    if (src.source === 'major-mlb') {
      // Path style: /boxscore/{eventId}
      const path = `${src.endpoints.boxScore.replace(/\/$/, '')}/${encodeURIComponent(String(gameID))}`;
      url = new URL(`https://${src.host}${path}`);
    } else if (src.source === 'nfl') {
      // Query style: /nflboxscore?id={gameID}
      url = new URL(`https://${src.host}${src.endpoints.boxScore}`);
      url.searchParams.set('id', String(gameID));
    }

    const upstream = await fetch(url.toString(), {
      method: 'GET',
      headers: src.headers,
    });

    const data = await upstream.json().catch(() => ({}));
    const raw = data?.body || data || {};

    function isLikelyPlayer(obj) {
      if (!obj || typeof obj !== 'object') return false;
      const id = obj.playerID || obj.playerId || obj.id;
      const hasName = obj.longName || obj.fullName || obj.firstName || obj.lastName || obj.playerName || obj.name;
      const hasPos = obj.pos || obj.position;
      return (!!id || !!hasName) && (hasName || hasPos);
    }

    function flattenNumericStats(obj, prefix = '', out = {}) {
      if (!obj || typeof obj !== 'object') return out;
      const skipKeys = new Set([
        'playerID','playerId','id','firstName','lastName','fullName','longName','name','playerName',
        'team','teamAbv','teamName','teamId','teamID','jersey','starter','isStarter','pos','position',
      ]);
      for (const [k, v] of Object.entries(obj)) {
        if (skipKeys.has(k)) continue;
        const p = prefix ? `${prefix}.${k}` : k;
        if (v && typeof v === 'object') {
          flattenNumericStats(v, p, out);
        } else {
          const num = typeof v === 'string' ? Number(v) : v;
          if (Number.isFinite(num)) {
            out[p] = num;
          }
        }
      }
      return out;
    }

    const playerMap = {};

    function upsertPlayer(obj, teamAbvCtx) {
      const nameStr = obj.longName || obj.fullName || obj.playerName || obj.name || `${obj.firstName || ''} ${obj.lastName || ''}`.trim();
      const ctxTeam = (obj.teamAbv || obj.team || obj.teamName || teamAbvCtx || '').toString().toUpperCase();
      const generatedIdBase = `${ctxTeam || 'UNK'}:${nameStr || 'UNKNOWN'}`;
      const id = String(obj.playerID || obj.playerId || obj.id || generatedIdBase);
      const longName = nameStr;
      const pos = obj.pos || obj.position || '';
      const stats = flattenNumericStats(obj);
      const existing = playerMap[id] || {};
      playerMap[id] = {
        id,
        longName: longName || existing.longName || id,
        firstName: obj.firstName || existing.firstName || '',
        lastName: obj.lastName || existing.lastName || '',
        pos: pos || existing.pos || '',
        teamAbv: ctxTeam || existing.teamAbv || '',
        stats: { ...(existing.stats || {}), ...(stats || {}) },
      };
    }

    function collectPlayers(node, ctx) {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) {
        for (const item of node) collectPlayers(item, ctx);
        return;
      }

      const homeAbv = node.homeAbv || node.homeTeamAbv || node.home || node.homeTeam;
      const awayAbv = node.awayAbv || node.awayTeamAbv || node.away || node.awayTeam;
      const nodeTeamAbv = (node.teamAbv || node.team_abv || (node.team && node.team.abbreviation)) || undefined;

      if (isLikelyPlayer(node)) {
        const teamCtx = node.teamAbv || nodeTeamAbv || ctx || (node.teamSide === 'home' ? homeAbv : node.teamSide === 'away' ? awayAbv : undefined);
        upsertPlayer(node, teamCtx);
      }

      for (const [key, val] of Object.entries(node)) {
        const keyLc = String(key).toLowerCase();
        if (Array.isArray(val)) {
          const looksLikePlayers = keyLc.includes('player') || keyLc.includes('athlete') || keyLc.includes('batter') || keyLc.includes('pitcher') || keyLc.includes('lineup') || keyLc.includes('roster');
          if (looksLikePlayers) {
            const teamCtx = keyLc.includes('home') ? (homeAbv || nodeTeamAbv || ctx) : keyLc.includes('away') ? (awayAbv || nodeTeamAbv || ctx) : (nodeTeamAbv || ctx);
            for (const item of val) {
              if (item && typeof item === 'object') {
                if (isLikelyPlayer(item)) {
                  upsertPlayer(item, teamCtx);
                } else {
                  collectPlayers(item, teamCtx);
                }
              }
            }
            continue;
          }
        }
        collectPlayers(val, (nodeTeamAbv || ctx || homeAbv || awayAbv));
      }
    }

    function coerceNumeric(val) {
      if (typeof val === 'number') return Number.isFinite(val) ? val : undefined;
      if (typeof val !== 'string') return undefined;
      // numeric like 5 or 5.1 or .297
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
              // Attach per-player gameLine mapping for batting group using labels -> raw values
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
      return { map, keys: Array.from(keySet).sort(), battingLabels };
    }

    let statKeys = [];
    let gameLineLabels = undefined;
    if (src.source === 'major-mlb') {
      const { map, keys, battingLabels } = normalizeMajorMlbPlayers(raw);
      Object.assign(playerMap, map);
      statKeys = keys;
      gameLineLabels = Array.isArray(battingLabels) ? battingLabels : undefined;
      // Fallback scan for any extra players/stat keys we can parse
      collectPlayers(raw, undefined);
      for (const p of Object.values(playerMap)) {
        Object.keys(p.stats || {}).forEach((k) => { if (!statKeys.includes(k)) statKeys.push(k); });
      }
      statKeys.sort();
    } else if (src.source === 'nfl') {
      // The NFL box score mirrors ESPN grouping; map labels->values into flat stats like MLB logic
      const map = {};
      const keySet = new Set();
      try {
        const teamBlocks = Array.isArray(raw?.players) ? raw.players : [];
        for (const teamBlock of teamBlocks) {
          const teamAbv = String(teamBlock?.team?.abbreviation || '').toUpperCase();
          const statGroups = Array.isArray(teamBlock?.statistics) ? teamBlock.statistics : [];
          for (const group of statGroups) {
            const keys = Array.isArray(group?.keys) ? group.keys : [];
            const labels = Array.isArray(group?.labels) ? group.labels : [];
            const athletes = Array.isArray(group?.athletes) ? group.athletes : [];
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
                // NFL values include mixed strings (e.g., "26/49"); keep numeric-only
                const num = (() => {
                  if (typeof val === 'number') return Number.isFinite(val) ? val : undefined;
                  if (typeof val !== 'string') return undefined;
                  const t = val.trim();
                  if (/^[+-]?\d*(?:\.\d+)?$/.test(t) && t !== '' && t !== '+' && t !== '-') return parseFloat(t);
                  return undefined;
                })();
                if (num !== undefined) {
                  stats[key] = num;
                  keySet.add(key);
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
              };
            }
          }
        }
      } catch {}
      Object.assign(playerMap, map);
      statKeys = Array.from(keySet).sort();
      // Note: Do NOT run fallback collectPlayers for NFL to avoid pulling in non-player nodes (e.g., metric groups)
    }

    const statusCode = upstream.ok ? 200 : (upstream.status || 502);
    return res.status(statusCode).json({
      success: upstream.ok,
      message: upstream.ok ? 'Box score fetched' : 'Box score request failed',
      meta: { upstreamStatus: upstream.status, gameID: String(gameID), source: src.source },
      data: raw,
      normalized: { playersById: playerMap, statKeys, ...(gameLineLabels ? { gameLineLabels } : {}) },
    });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message || 'Unknown error' });
  }
}


