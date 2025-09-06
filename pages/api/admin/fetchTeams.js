import { getToken } from 'next-auth/jwt';
import { resolveSourceConfig } from '../../../lib/apiSources';
import { createRepositories } from '../../../lib/dal/factory';
import { getDataBackend } from '../../../lib/runtimeConfig';

function extractTeams(payload) {
  const teams = [];
  const seen = new Set();
  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { for (const item of node) visit(item); return; }
    const abbreviation = node.abbreviation || node.shortDisplayName || node.slug || node.teamAbv || null;
    const id = node.id || node.teamId || node.teamID || null;
    const name = node.displayName || node.name || node.fullName || node.teamName || null;
    if (abbreviation && id) {
      const key = `${String(id)}::${String(abbreviation).toUpperCase()}`;
      if (!seen.has(key)) {
        seen.add(key);
        teams.push({
          teamID: String(id),
          teamAbbreviation: String(abbreviation).toUpperCase(),
          teamNameFull: name ? String(name) : String(abbreviation).toUpperCase(),
        });
      }
    }
    for (const v of Object.values(node)) visit(v);
  };
  visit(payload);
  return teams;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  const { league = 'nfl' } = req.body || {};

  try {
    const src = resolveSourceConfig(String(league).toLowerCase());
    if (!src.ok) return res.status(500).json({ success: false, error: 'Missing external source configuration' });

    const teamListUrl = new URL(`https://${src.host}${league === 'nfl' ? '/nflteamlist' : '/nflteamlist'}`);
    const resp = await fetch(teamListUrl.toString(), { method: 'GET', headers: src.headers });
    const json = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      return res.status(resp.status).json({ success: false, error: 'Failed to fetch teams from source', details: json });
    }

    const parsed = extractTeams(json);
    const { teams } = createRepositories();
    let upserted = 0;

    // For each team ID, fetch detailed team info to capture logo URL and full names
    for (const t of parsed) {
      try {
        const detailsUrl = new URL(`https://${src.host}/nflteamplayers`);
        detailsUrl.searchParams.set('teamid', t.teamID);
        const detailsResp = await fetch(detailsUrl.toString(), { method: 'GET', headers: src.headers });
        const detailsJson = await detailsResp.json().catch(() => ({}));

        // Some responses wrap team data under `team`
        const teamNode = detailsJson?.team || null;
        const teamLogoURL = teamNode?.logos?.[0]?.href || null;
        const teamNameShort = teamNode?.shortDisplayName || null;
        const teamAbbreviation = teamNode?.abbreviation || t.teamAbbreviation || null;
        const nameCandidate = teamNode?.displayName || teamNode?.name || t.teamNameFull || null;

        const fields = {
          teamID: String(teamNode?.id || t.teamID),
          teamAbbreviation: teamAbbreviation ? String(teamAbbreviation).toUpperCase() : null,
          teamName: nameCandidate || null,
          teamNameFull: nameCandidate || null,
          teamNameShort: teamNameShort || null,
          teamLeague: String(league).toLowerCase(),
          teamLogoURL: teamLogoURL || null,
        };

        // Prefer update; if nothing updated, create (Airtable may not upsert on create)
        const maybeUpdated = await teams.updateOne(fields.teamID, fields);
        if (maybeUpdated && maybeUpdated.id) {
          upserted += 1;
          continue;
        }
        const created = await teams.createOne(fields);
        if (created && created.id) upserted += 1;
      } catch (err) {
        // Continue processing other teams on failure
        // eslint-disable-next-line no-console
        console.warn('[api/admin/fetchTeams] Skipping team due to error', t, err?.message || err);
      }
    }

    return res.status(200).json({ success: true, upserted, backend: getDataBackend() });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message || 'Unknown error' });
  }
}


