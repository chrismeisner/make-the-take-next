import { createRepositories } from '../../../lib/dal/factory';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
  const code = String(req.query.code || '').trim();
  if (!code) return res.status(400).json({ success: false, error: 'Missing code' });

  try {
    const { awards } = createRepositories();
    const rec = await awards.getByCode(code);
    if (!rec) return res.status(404).json({ success: false, error: 'Code not found' });
    const now = Date.now();
    const isBefore = rec.valid_from ? new Date(rec.valid_from).getTime() > now : false;
    const isAfter = rec.valid_to ? new Date(rec.valid_to).getTime() < now : false;
    const status = isBefore || isAfter ? 'expired' : rec.status;
    // Resolve requirement team name and route slug if applicable
    let requirementTeamName = null;
    let requirementTeamRouteSlug = null;
    try {
      const { query } = await import('../../../lib/db/postgres');
      if (rec.requirement_team_id) {
        const { rows } = await query('SELECT name, team_slug FROM teams WHERE id = $1 LIMIT 1', [rec.requirement_team_id]);
        requirementTeamName = rows?.[0]?.name || null;
        requirementTeamRouteSlug = rows?.[0]?.team_slug || null;
      } else if (rec.requirement_team_slug) {
        const { rows } = await query(
          `SELECT name, team_slug FROM teams 
             WHERE LOWER(team_slug) = LOWER($1) OR LOWER(abbreviation) = LOWER($1)
             LIMIT 1`,
          [rec.requirement_team_slug]
        );
        requirementTeamName = rows?.[0]?.name || null;
        requirementTeamRouteSlug = rows?.[0]?.team_slug || null;
      }
    } catch {}
    return res.status(200).json({ success: true, code: rec.code, name: rec.name, tokens: Number(rec.tokens) || 0, status, redirectTeamSlug: rec.redirect_team_slug || null, imageUrl: rec.image_url || null, requirementKey: rec.requirement_key || null, requirementTeamSlug: rec.requirement_team_slug || null, requirementTeamId: rec.requirement_team_id || null, requirementTeamName, requirementTeamRouteSlug });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[awards/preview] error', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}


