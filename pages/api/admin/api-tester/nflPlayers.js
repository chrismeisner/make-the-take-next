import { resolveSourceConfig } from "../../../../lib/apiSources";
import { createRepositories } from "../../../../lib/dal/factory";

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  const { teamAbv } = req.query || {};
  try { console.log('[api-tester/nflPlayers] start', { teamAbv }); } catch {}
  if (!teamAbv) {
    return res.status(400).json({ success: false, error: 'teamAbv query param is required (comma-separated for multiple teams)' });
  }

  const src = resolveSourceConfig('nfl');
  try { console.log('[api-tester/nflPlayers] resolved source', { ok: src?.ok }); } catch {}
  if (!src.ok) return res.status(500).json({ success: false, error: src.error || 'Missing RapidAPI config' });

  try {
    const abvs = String(teamAbv).split(',').map((t) => t.trim()).filter(Boolean).map((t) => t.toUpperCase());
    try { console.log('[api-tester/nflPlayers] requested ABVs', abvs); } catch {}

    // Build abbreviation -> teamId mapping from Postgres Teams table (preferred)
    const abvToId = new Map();
    try {
      const { teams } = createRepositories();
      const all = await teams.listAll();
      try { console.log('[api-tester/nflPlayers] teams.listAll()', { count: Array.isArray(all) ? all.length : 0 }); } catch {}
      for (const t of all) {
        const typeLc = String(t.teamType || '').toLowerCase();
        if (typeLc !== 'nfl') continue;
        const abv = String(t.teamAbbreviation || '').toUpperCase();
        const teamId = String(t.teamID || '').trim();
        if (abv && teamId && !abvToId.has(abv)) abvToId.set(abv, teamId);
      }
    } catch {}
    // Fallback to RapidAPI team list if Airtable has no mapping for requested abbreviations
    const needAbvs = abvs.filter((a) => !abvToId.has(a));
    if (needAbvs.length) {
      try { console.log('[api-tester/nflPlayers] missing ABVs from DB, fetching list', needAbvs); } catch {}
      const teamListUrl = new URL(`https://${src.host}${'/nflteamlist'}`);
      const teamListResp = await fetch(teamListUrl.toString(), { method: 'GET', headers: src.headers });
      const teamListJson = await teamListResp.json().catch(() => ({}));
      try { console.log('[api-tester/nflPlayers] team list response', { ok: teamListResp.ok, status: teamListResp.status }); } catch {}
      function extractTeamsList(obj) {
        if (!obj || typeof obj !== 'object') return [];
        const candidates = [];
        const visit = (node) => {
          if (!node || typeof node !== 'object') return;
          if (Array.isArray(node)) { for (const item of node) visit(item); return; }
          const abv = node.abbreviation || node.shortDisplayName || node.slug;
          const id = node.id || node.teamId;
          if (abv && id) candidates.push({ abbreviation: String(abv), id: String(id) });
          for (const val of Object.values(node)) visit(val);
        };
        visit(obj);
        return candidates;
      }
      const teamsList = extractTeamsList(teamListJson);
      for (const t of teamsList) {
        const key = String(t.abbreviation || '').toUpperCase();
        const id = String(t.id || '').trim();
        if (key && id && !abvToId.has(key)) abvToId.set(key, id);
      }
    }

    async function fetchRosterForTeam(abvUpper) {
      const teamId = abvToId.get(abvUpper);
      if (!teamId) return { ok: false, abv: abvUpper, status: 400, data: { error: `Unknown teamId for ${abvUpper}` } };
      // Prefer rich team players endpoint (has positions)
      const url = new URL(`https://${src.host}${src.endpoints.teamPlayers}`);
      url.searchParams.set('teamid', String(teamId));
      try { console.log('[api-tester/nflPlayers] fetching roster', { abv: abvUpper, teamId, url: url.toString() }); } catch {}
      const resp = await fetch(url.toString(), { method: 'GET', headers: src.headers });
      const json = await resp.json().catch(() => ({}));
      try { console.log('[api-tester/nflPlayers] roster response', { abv: abvUpper, ok: resp.ok, status: resp.status }); } catch {}
      if (!resp.ok) {
        return { ok: false, abv: abvUpper, status: resp.status, data: json };
      }
      return { ok: true, abv: abvUpper, teamId, data: json };
    }

    const fetches = await Promise.all(abvs.map(fetchRosterForTeam));
    try {
      const summary = fetches.map((r) => ({ abv: r.abv, ok: r.ok, status: r.status || 200 }));
      console.log('[api-tester/nflPlayers] fetch results summary', summary);
    } catch {}
    const failures = fetches.filter((r) => !r.ok);

    // Build mapping: playerID -> { id, longName, pos, teamAbv }
    const playersById = {};

    function collectPlayers(node, teamAbvCtx) {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) {
        for (const item of node) collectPlayers(item, teamAbvCtx);
        return;
      }
      const athlete = node.athlete || node.player || {};
      const rawId = String(
        node.playerId || node.playerID || node.player_id ||
        athlete.id || athlete.athleteId || athlete.playerId ||
        node.id || ''
      ).trim();
      const name = (
        athlete.displayName || athlete.fullName || athlete.name ||
        node.playerName || node.name || node.displayName || node.fullName ||
        `${athlete.firstName || ''} ${athlete.lastName || ''}`.trim()
      );
      const first = (
        athlete.firstName || node.firstName || null
      );
      const last = (
        athlete.lastName || node.lastName || null
      );
      const pos = (
        (node.position && (node.position.abbreviation || node.position.name)) ||
        (athlete.position && (athlete.position.abbreviation || athlete.position.name)) ||
        node.positionAbbreviation || node.positionShort || node.playerPosition || node.pos || ''
      );
      // Accept likely player nodes: must have a name; id preferred but can fallback to name key
      if (name) {
        const id = rawId || name;
        const existing = playersById[id] || {};
        playersById[id] = {
          id,
          longName: name || existing.longName || id,
          firstName: first || existing.firstName || null,
          lastName: last || existing.lastName || null,
          pos: pos || existing.pos || '',
          teamAbv: teamAbvCtx || existing.teamAbv || '',
        };
      }
      for (const [k, v] of Object.entries(node)) {
        const kLc = String(k).toLowerCase();
        // Traverse likely player-bearing containers; expand heuristics for RapidAPI shapes
        const looksPlayers = (
          kLc.includes('athlete') || kLc.includes('player') || kLc.includes('players') ||
          kLc.includes('roster') || kLc.includes('teamplayers') || kLc.includes('team_players') ||
          kLc === 'response' || kLc === 'result' || kLc.includes('members') || kLc.includes('entries')
        );
        if (looksPlayers) {
          collectPlayers(v, teamAbvCtx);
        }
      }
    }

    for (const r of fetches) {
      if (!r.ok) continue;
      // Try to infer teamAbv from the mapping that produced this teamId
      const abvUpper = r.abv;
      // Preferred shape: { team: { athletes: [...] } }
      const root = (r.data && r.data.team && Array.isArray(r.data.team.athletes)) ? r.data.team.athletes
                  : (r.data && r.data.data ? r.data.data : r.data);
      collectPlayers(root, abvUpper);
    }

    if (failures.length && fetches.every((r) => !r.ok)) {
      try { console.warn('[api-tester/nflPlayers] all fetches failed', failures.map(f => ({ abv: f.abv, status: f.status }))); } catch {}
      return res.status(502).json({ success: false, error: 'Failed to fetch any NFL team players', details: failures });
    }

    const count = Object.keys(playersById).length;
    try { console.log('[api-tester/nflPlayers] collected players', { count }); } catch {}
    return res.status(200).json({ success: true, teams: abvs, count, playersById });
  } catch (e) {
    try { console.error('[api-tester/nflPlayers] error', e); } catch {}
    return res.status(500).json({ success: false, error: e.message || 'Unknown error' });
  }
}
