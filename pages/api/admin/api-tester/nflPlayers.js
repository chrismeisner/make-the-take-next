import { resolveSourceConfig } from "../../../../lib/apiSources";

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  const { teamAbv } = req.query || {};
  if (!teamAbv) {
    return res.status(400).json({ success: false, error: 'teamAbv query param is required (comma-separated for multiple teams)' });
  }

  const src = resolveSourceConfig('nfl');
  if (!src.ok) return res.status(500).json({ success: false, error: src.error || 'Missing RapidAPI config' });

  try {
    const abvs = String(teamAbv).split(',').map((t) => t.trim()).filter(Boolean).map((t) => t.toUpperCase());

    // Build abbreviation -> teamId mapping from NFL team list
    const teamListUrl = new URL(`https://${src.host}${'/nflteamlist'}`);
    const teamListResp = await fetch(teamListUrl.toString(), { method: 'GET', headers: src.headers });
    const teamListJson = await teamListResp.json().catch(() => ({}));

    function extractTeamsList(obj) {
      if (!obj || typeof obj !== 'object') return [];
      const candidates = [];
      const visit = (node) => {
        if (!node || typeof node !== 'object') return;
        if (Array.isArray(node)) {
          for (const item of node) visit(item);
          return;
        }
        // Looks like a team if it has abbreviation and id/teamId
        const abv = node.abbreviation || node.shortDisplayName || node.slug;
        const id = node.id || node.teamId;
        if (abv && id) candidates.push({ abbreviation: String(abv), id: String(id) });
        for (const val of Object.values(node)) visit(val);
      };
      visit(obj);
      return candidates;
    }

    const teamsList = extractTeamsList(teamListJson);
    const abvToId = new Map();
    for (const t of teamsList) {
      const key = String(t.abbreviation || '').toUpperCase();
      const id = String(t.id || '').trim();
      if (key && id && !abvToId.has(key)) abvToId.set(key, id);
    }

    async function fetchRosterForTeam(abvUpper) {
      const teamId = abvToId.get(abvUpper);
      if (!teamId) return { ok: false, abv: abvUpper, status: 400, data: { error: `Unknown teamId for ${abvUpper}` } };
      const url = new URL(`https://${src.host}${'/nflteamplayers'}`);
      url.searchParams.set('teamid', String(teamId));
      const resp = await fetch(url.toString(), { method: 'GET', headers: src.headers });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        return { ok: false, abv: abvUpper, status: resp.status, data: json };
      }
      return { ok: true, abv: abvUpper, teamId, data: json };
    }

    const fetches = await Promise.all(abvs.map(fetchRosterForTeam));
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
      const id = String(node.playerId || athlete.id || node.id || '').trim();
      const name = athlete.displayName || athlete.fullName || node.displayName || node.fullName || `${athlete.firstName || node.firstName || ''} ${athlete.lastName || node.lastName || ''}`.trim();
      const pos = (node.position && (node.position.abbreviation || node.position.name)) || (athlete.position && (athlete.position.abbreviation || athlete.position.name)) || node.pos || '';

      if (id || name) {
        const existing = playersById[id] || {};
        playersById[id || name] = {
          id: id || name,
          longName: name || existing.longName || (id || ''),
          pos: pos || existing.pos || '',
          teamAbv: teamAbvCtx || existing.teamAbv || '',
        };
      }
      for (const [k, v] of Object.entries(node)) {
        const kLc = String(k).toLowerCase();
        const looksPlayers = kLc.includes('athlete') || kLc.includes('player') || kLc.includes('roster') || kLc.includes('teamplayers');
        if (looksPlayers) {
          collectPlayers(v, teamAbvCtx);
        } else {
          collectPlayers(v, teamAbvCtx);
        }
      }
    }

    for (const r of fetches) {
      if (!r.ok) continue;
      // Try to infer teamAbv from the mapping that produced this teamId
      const abvUpper = r.abv;
      collectPlayers(r.data, abvUpper);
    }

    if (failures.length && fetches.every((r) => !r.ok)) {
      return res.status(502).json({ success: false, error: 'Failed to fetch any NFL team players', details: failures });
    }

    return res.status(200).json({ success: true, teams: abvs, count: Object.keys(playersById).length, playersById });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message || 'Unknown error' });
  }
}
