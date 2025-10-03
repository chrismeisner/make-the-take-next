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
    // Determine promo vs award details
    const kind = rec.kind || 'award';
    let targetType = null;
    let targetSlug = null;
    let targetSeriesId = null;
    if (kind === 'promo') {
      if (rec.requirement_series_id || rec.requirement_series_slug) {
        targetType = 'series';
        targetSeriesId = rec.requirement_series_id || rec.requirement_series_slug || null;
      } else if (rec.requirement_team_slug || rec.requirement_team_id) {
        targetType = 'team';
        targetSlug = requirementTeamRouteSlug || rec.requirement_team_slug || null;
      }
    }

    // Compute hasUpcomingOrLive for target when promo
    let hasUpcomingOrLive = false;
    let displayImageUrl = rec.image_url || null;
    let nextEventTime = null;
    let nextPackCoverUrl = null;
    if (kind === 'promo') {
      try {
        const { query } = await import('../../../lib/db/postgres');
        if (targetType === 'team' && targetSlug) {
          const { rows } = await query(
            `SELECT EXISTS (
               SELECT 1
                 FROM packs p
                 LEFT JOIN events e ON e.id = p.event_id
                 LEFT JOIN teams ht ON e.home_team_id = ht.id
                 LEFT JOIN teams at ON e.away_team_id = at.id
                WHERE LOWER(COALESCE(p.pack_status,'')) IN ('active','open','coming-soon','live')
                  AND (LOWER(ht.team_slug) = LOWER($1) OR LOWER(at.team_slug) = LOWER($1))
             ) AS ok`,
            [targetSlug]
          );
          hasUpcomingOrLive = Boolean(rows?.[0]?.ok);

          // Determine next upcoming event time and its pack cover (team)
          try {
            const { rows: nextRows } = await query(
              `SELECT sub.cover_url, sub.event_time
                 FROM (
                   SELECT p.cover_url, e.event_time
                     FROM packs p
                     JOIN events e ON e.id = p.event_id
                     JOIN teams ht ON e.home_team_id = ht.id
                     JOIN teams at ON e.away_team_id = at.id
                    WHERE LOWER(COALESCE(p.pack_status,'')) IN ('active','open','coming-soon','live')
                      AND e.event_time IS NOT NULL
                      AND e.event_time > NOW()
                      AND (LOWER(ht.team_slug) = LOWER($1) OR LOWER(at.team_slug) = LOWER($1))
                   UNION ALL
                   SELECT p.cover_url, e.event_time
                     FROM packs_events pe
                     JOIN events e ON e.id = pe.event_id
                     JOIN packs p ON p.id = pe.pack_id
                     JOIN teams ht ON e.home_team_id = ht.id
                     JOIN teams at ON e.away_team_id = at.id
                    WHERE LOWER(COALESCE(p.pack_status,'')) IN ('active','open','coming-soon','live')
                      AND e.event_time IS NOT NULL
                      AND e.event_time > NOW()
                      AND (LOWER(ht.team_slug) = LOWER($1) OR LOWER(at.team_slug) = LOWER($1))
                 ) sub
             ORDER BY sub.event_time ASC
                LIMIT 1`,
              [targetSlug]
            );
            if (nextRows && nextRows.length > 0) {
              nextEventTime = nextRows[0].event_time ? new Date(nextRows[0].event_time).toISOString() : null;
              nextPackCoverUrl = nextRows[0].cover_url || null;
            }
          } catch {}
          if (!displayImageUrl) {
            try {
              const { rows: tl } = await query('SELECT logo_url FROM teams WHERE LOWER(team_slug) = LOWER($1) LIMIT 1', [targetSlug]);
              displayImageUrl = tl?.[0]?.logo_url || null;
            } catch {}
          }
        } else if (targetType === 'series' && targetSeriesId) {
          const { rows } = await query(
            `SELECT EXISTS (
               SELECT 1
                 FROM series s
                 JOIN series_packs spx ON spx.series_id = s.id
                 JOIN packs p ON p.id = spx.pack_id
                WHERE (s.series_id = $1 OR s.id::text = $1)
                  AND LOWER(COALESCE(p.pack_status,'')) IN ('active','open','coming-soon','live')
             ) AS ok`,
            [String(targetSeriesId)]
          );
          hasUpcomingOrLive = Boolean(rows?.[0]?.ok);

          // Determine next upcoming event time and pack cover (series)
          try {
            const { rows: nextRows } = await query(
              `SELECT sub.cover_url, sub.event_time
                 FROM (
                   SELECT p.cover_url, e.event_time
                     FROM series s
                     JOIN series_packs spx ON spx.series_id = s.id
                     JOIN packs p ON p.id = spx.pack_id
                     JOIN events e ON e.id = p.event_id
                    WHERE (s.series_id = $1 OR s.id::text = $1)
                      AND LOWER(COALESCE(p.pack_status,'')) IN ('active','open','coming-soon','live')
                      AND e.event_time IS NOT NULL
                      AND e.event_time > NOW()
                   UNION ALL
                   SELECT p.cover_url, e.event_time
                     FROM series s
                     JOIN series_packs spx ON spx.series_id = s.id
                     JOIN packs p ON p.id = spx.pack_id
                     JOIN packs_events pe ON pe.pack_id = p.id
                     JOIN events e ON e.id = pe.event_id
                    WHERE (s.series_id = $1 OR s.id::text = $1)
                      AND LOWER(COALESCE(p.pack_status,'')) IN ('active','open','coming-soon','live')
                      AND e.event_time IS NOT NULL
                      AND e.event_time > NOW()
                 ) sub
             ORDER BY sub.event_time ASC
                LIMIT 1`,
              [String(targetSeriesId)]
            );
            if (nextRows && nextRows.length > 0) {
              nextEventTime = nextRows[0].event_time ? new Date(nextRows[0].event_time).toISOString() : null;
              nextPackCoverUrl = nextRows[0].cover_url || null;
            }
          } catch {}
        }
      } catch {}
    }

    return res.status(200).json({ success: true, kind, code: rec.code, name: rec.name, tokens: Number(rec.tokens) || 0, status, redirectTeamSlug: rec.redirect_team_slug || null, imageUrl: displayImageUrl, requirementKey: rec.requirement_key || null, requirementTeamSlug: rec.requirement_team_slug || null, requirementTeamId: rec.requirement_team_id || null, requirementTeamName, requirementTeamRouteSlug, targetType, targetSlug, targetSeriesId, hasUpcomingOrLive, nextEventTime, nextPackCoverUrl });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[awards/preview] error', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}


