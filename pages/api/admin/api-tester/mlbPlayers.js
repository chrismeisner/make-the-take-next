import { resolveSourceConfig } from "../../../../lib/apiSources";
import { createRepositories } from "../../../../lib/dal/factory";

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  const { teamAbv } = req.query || {};
  try { console.log('[api-tester/mlbPlayers] start', { teamAbv }); } catch {}
  if (!teamAbv) {
    return res.status(400).json({ success: false, error: 'teamAbv query param is required (comma-separated for multiple teams)' });
  }

  const src = resolveSourceConfig('mlb');
  try { console.log('[api-tester/mlbPlayers] resolved source', { ok: src?.ok }); } catch {}
  if (!src.ok) return res.status(500).json({ success: false, error: src.error || 'Missing RapidAPI config' });

  try {
    const abvs = String(teamAbv).split(',').map((t) => t.trim()).filter(Boolean).map((t) => t.toUpperCase());

    // Build abbreviation -> teamId mapping from Postgres Teams table (preferred)
    const abvToId = new Map();
    try {
      const { teams } = createRepositories();
      const all = await teams.listAll();
      for (const t of all) {
        const typeLc = String(t.teamType || '').toLowerCase();
        if (typeLc !== 'mlb') continue;
        const abv = String(t.teamAbbreviation || '').toUpperCase();
        const teamId = String(t.teamID || '').trim();
        if (abv && teamId && !abvToId.has(abv)) abvToId.set(abv, teamId);
      }
    } catch {}

    async function fetchRosterForTeam(abvUpper) {
      const teamId = abvToId.get(abvUpper);
      if (!teamId) return { ok: false, abv: abvUpper, status: 400, data: { error: `Unknown teamId for ${abvUpper}` } };
      const url = new URL(`https://${src.host}${src.endpoints.teamPlayers || '/players/id'}`);
      // RapidAPI MLB expects teamId param name "teamId"
      url.searchParams.set('teamId', String(teamId));
      try { console.log('[api-tester/mlbPlayers] fetching roster', { abv: abvUpper, teamId, url: url.toString() }); } catch {}
      const resp = await fetch(url.toString(), { method: 'GET', headers: src.headers });
      const text = await resp.text();
      let json = {};
      try { json = JSON.parse(text); } catch { json = { raw: text }; }
      try { console.log('[api-tester/mlbPlayers] roster response', { abv: abvUpper, ok: resp.ok, status: resp.status }); } catch {}
      if (!resp.ok) {
        return { ok: false, abv: abvUpper, status: resp.status, data: json };
      }
      return { ok: true, abv: abvUpper, teamId, data: json };
    }

    const fetches = await Promise.all(abvs.map(fetchRosterForTeam));
    const failures = fetches.filter((r) => !r.ok);

    // Build mapping: playerID -> { id, longName, firstName, lastName, teamAbv }
    const playersById = {};

    function collectPlayers(node, teamAbvCtx) {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) {
        for (const item of node) collectPlayers(item, teamAbvCtx);
        return;
      }
      const rawId = String(
        node.playerId || node.playerID || node.player_id ||
        node.id || ''
      ).trim();
      const name = (
        node.displayName || node.fullName || node.name ||
        `${node.firstName || ''} ${node.lastName || ''}`.trim()
      );
      const first = node.firstName || null;
      const last = node.lastName || null;
      const pos = node.positionAbbreviation || node.positionShort || node.playerPosition || node.pos || '';
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
        const looksPlayers = (
          kLc.includes('player') || kLc.includes('players') ||
          kLc.includes('roster') || kLc === 'data' || kLc === 'response' || kLc === 'result'
        );
        if (looksPlayers) collectPlayers(v, teamAbvCtx);
      }
    }

    for (const r of fetches) {
      if (!r.ok) continue;
      const root = (r.data && Array.isArray(r.data.data)) ? r.data.data : r.data?.data || r.data;
      collectPlayers(root, r.abv);
    }

    if (failures.length && fetches.every((r) => !r.ok)) {
      try { console.warn('[api-tester/mlbPlayers] all fetches failed', failures.map(f => ({ abv: f.abv, status: f.status }))); } catch {}
      return res.status(502).json({ success: false, error: 'Failed to fetch any MLB team players', details: failures });
    }

    const count = Object.keys(playersById).length;
    try { console.log('[api-tester/mlbPlayers] collected players', { count }); } catch {}
    return res.status(200).json({ success: true, teams: abvs, count, playersById });
  } catch (e) {
    try { console.error('[api-tester/mlbPlayers] error', e); } catch {}
    return res.status(500).json({ success: false, error: e.message || 'Unknown error' });
  }
}


