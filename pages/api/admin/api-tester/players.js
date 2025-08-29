import { resolveSourceConfig } from "../../../../lib/apiSources";
import Airtable from "airtable";

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  const { teamAbv, season: seasonParam } = req.query;
  const src = resolveSourceConfig('major-mlb');
  if (!src.ok) return res.status(500).json({ success: false, error: src.error || 'Missing RapidAPI config' });
  if (!teamAbv) {
    return res.status(400).json({ success: false, error: 'teamAbv query param is required (comma-separated for multiple teams)' });
  }
  const season = String(seasonParam || new Date().getFullYear());

  try {
    const teamAbvs = String(teamAbv).split(',').map((t) => t.trim()).filter(Boolean);

    // Build abbreviation -> teamId mapping from Airtable Teams
    const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);
    const records = await base('Teams').select({ maxRecords: 200 }).all();
    const abvToTeamId = new Map();
    for (const r of records) {
      const fields = r.fields || {};
      const abv = String(fields.teamAbbreviation || '').toUpperCase();
      const teamId = String(fields.teamID || '').trim();
      if (abv && teamId) abvToTeamId.set(abv, teamId);
    }

    async function fetchRosterForTeam(abv) {
      const abvUpper = String(abv).toUpperCase();
      const teamId = abvToTeamId.get(abvUpper);
      if (!teamId) return { ok: false, abv: abvUpper, status: 400, data: { error: `Unknown teamId for ${abvUpper}` } };
      const url = new URL(`https://${src.host}${src.endpoints.teamRoster}`);
      url.searchParams.set('teamId', String(teamId));
      url.searchParams.set('season', season);
      const resp = await fetch(url.toString(), { method: 'GET', headers: src.headers });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        return { ok: false, abv: abvUpper, status: resp.status, data: json };
      }
      return { ok: true, abv: abvUpper, data: json, endpoint: 'team-roster' };
    }

    const results = await Promise.all(teamAbvs.map(fetchRosterForTeam));
    const failures = results.filter((r) => !r.ok);
    if (failures.length && results.every((r) => !r.ok)) {
      return res.status(502).json({ success: false, error: 'Failed to fetch any team rosters', details: failures });
    }

    // Build mapping: playerID -> { id, longName, firstName, lastName, pos, teamAbv }
    const playerMap = {};
    const teams = [];
    for (const r of results) {
      teams.push(r.abv);
      const body = r.data?.body || r.data || {};
      // Normalize list depending on endpoint
      let list = [];
      if (Array.isArray(body)) {
        list = body;
      } else if (body && Array.isArray(body.roster)) {
        list = body.roster;
      } else if (body && Array.isArray(body.teamRoster)) {
        list = body.teamRoster;
      } else {
        list = Object.values(body || {});
      }
      list.forEach((p) => {
        const id = String(p.playerID || p.playerId || p.athleteId || p.id || '').trim();
        if (!id) return;
        playerMap[id] = {
          id,
          longName: p.longName || p.fullName || p.displayName || `${p.firstName || ''} ${p.lastName || ''}`.trim(),
          firstName: p.firstName || p.givenName || '',
          lastName: p.lastName || p.familyName || '',
          pos: p.pos || p.position || p.positionAbv || (p.primaryPosition && (p.primaryPosition.abbreviation || p.primaryPosition.name)) || '',
          teamAbv: p.teamAbv || p.team || r.abv,
          lastGamePlayed: p.lastGamePlayed || '',
          // Pass minimal stats object if present (useful for appearance heuristics)
          stats: p.stats && typeof p.stats === 'object' ? p.stats : undefined,
        };
      });
    }

    return res.status(200).json({ success: true, teams, count: Object.keys(playerMap).length, playersById: playerMap });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message || 'Unknown error' });
  }
}


