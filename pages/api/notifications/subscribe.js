import { getCurrentUser } from "../../../lib/auth";
import { getDataBackend } from "../../../lib/runtimeConfig";
import { query } from "../../../lib/db/postgres";

export default async function handler(req, res) {
  const backend = getDataBackend();
  if (backend !== 'postgres') {
    return res.status(400).json({ success: false, error: 'Postgres backend required' });
  }

  const user = await getCurrentUser(req);
  if (!user || !user.userId) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const category = String(body.category || 'pack_open').toLowerCase();
    const league = body.league ? String(body.league).toLowerCase() : null;
    const teamId = body.teamId ? String(body.teamId) : null;
    const teamSlug = body.teamSlug ? String(body.teamSlug) : null;
    const seriesId = body.seriesId ? String(body.seriesId) : null;
    const seriesSlug = body.seriesSlug ? String(body.seriesSlug) : null;

    if (category !== 'pack_open') {
      return res.status(400).json({ success: false, error: 'Unsupported category' });
    }

    // Resolve profile row id
    const profileId = user.userId;

    // Resolve optional team by slug
    let resolvedTeamId = teamId;
    if (!resolvedTeamId && teamSlug) {
      const { rows } = await query('SELECT id FROM teams WHERE team_slug = $1 LIMIT 1', [teamSlug]);
      resolvedTeamId = rows?.[0]?.id || null;
    }
    // Resolve optional series by slug or external id
    let resolvedSeriesId = seriesId;
    if (!resolvedSeriesId && seriesSlug) {
      const { rows } = await query('SELECT id FROM series WHERE series_id = $1 OR slug = $1 LIMIT 1', [seriesSlug]);
      resolvedSeriesId = rows?.[0]?.id || null;
    }

    // Insert or update preference row based on which scope is provided
    if (resolvedTeamId) {
      await query(
        `INSERT INTO notification_preferences (profile_id, category, team_id, opted_in)
         VALUES ($1, $2, $3, TRUE)
         ON CONFLICT (profile_id, category, team_id)
         DO UPDATE SET opted_in = EXCLUDED.opted_in, updated_at = NOW()`,
        [profileId, category, resolvedTeamId]
      );
    } else if (resolvedSeriesId) {
      await query(
        `INSERT INTO notification_preferences (profile_id, category, series_id, opted_in)
         VALUES ($1, $2, $3, TRUE)
         ON CONFLICT (profile_id, category, series_id)
         DO UPDATE SET opted_in = EXCLUDED.opted_in, updated_at = NOW()`,
        [profileId, category, resolvedSeriesId]
      );
    } else if (league) {
      await query(
        `INSERT INTO notification_preferences (profile_id, category, league, opted_in)
         VALUES ($1, $2, $3, TRUE)
         ON CONFLICT (profile_id, category, league)
         DO UPDATE SET opted_in = EXCLUDED.opted_in, updated_at = NOW()`,
        [profileId, category, league]
      );
    } else {
      return res.status(400).json({ success: false, error: 'Missing subscription target (league/team/series)' });
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[notifications/subscribe][POST] error =>', error);
    return res.status(500).json({ success: false, error: 'Failed to subscribe' });
  }
}


