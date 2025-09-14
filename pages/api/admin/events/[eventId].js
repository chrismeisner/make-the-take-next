import { getToken } from 'next-auth/jwt';
import { getDataBackend } from '../../../../lib/runtimeConfig';
import { query } from '../../../../lib/db/postgres';

export default async function handler(req, res) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  const { eventId } = req.query;
  if (!eventId) {
    return res.status(400).json({ success: false, error: 'Missing eventId parameter' });
  }

  if (req.method === 'GET') {
    try {
      const backend = getDataBackend();
      if (backend === 'postgres') {
        // Robust lookup by events.id (UUID as text), event_id (external text), or espn_game_id
        const makeSelect = (withCoverUrl) => `SELECT e.id,
                                   e.title         AS "eventTitle",
                                   e.event_time    AS "eventTime",
                                   e.league        AS "eventLeague",
                                   e.espn_game_id  AS "espnGameID",
                                   e.week          AS "eventWeek",
                                   e.home_team     AS "homeTeamRaw",
                                   e.away_team     AS "awayTeamRaw",
                                   e.home_team_id,
                                   e.away_team_id,
                                   ${withCoverUrl ? 'e.cover_url' : 'NULL::text'}   AS "eventCoverURL",
                                   ht.logo_url     AS "homeTeamLogo",
                                   at.logo_url     AS "awayTeamLogo",
                                   ht.name         AS "homeTeamName",
                                   at.name         AS "awayTeamName",
                                   ht.team_id      AS "homeTeamExternalID",
                                   at.team_id      AS "awayTeamExternalID",
                                   ht.team_slug    AS "homeTeamAbbreviation",
                                   at.team_slug    AS "awayTeamAbbreviation"
                              FROM events e
                         LEFT JOIN teams ht ON e.home_team_id = ht.id
                         LEFT JOIN teams at ON e.away_team_id = at.id`;
        let rows;
        try {
          ({ rows } = await query(
            `${makeSelect(true)}
              WHERE e.id::text = $1
                 OR e.event_id = $1
                 OR e.espn_game_id = $1
              LIMIT 1`,
            [eventId]
          ));
        } catch (e) {
          // Fallback if cover_url column doesn't exist yet
          ({ rows } = await query(
            `${makeSelect(false)}
              WHERE e.id::text = $1
                 OR e.event_id = $1
                 OR e.espn_game_id = $1
              LIMIT 1`,
            [eventId]
          ));
        }
        if (!rows || rows.length === 0) {
          return res.status(404).json({ success: false, error: 'Event not found' });
        }
        const r = rows[0];
        const homeTeamVal = r.homeTeamName || r.homeTeamRaw || null;
        const awayTeamVal = r.awayTeamName || r.awayTeamRaw || null;
        const event = {
          id: r.id,
          eventTitle: r.eventTitle,
          eventTime: r.eventTime,
          eventLeague: r.eventLeague,
          espnGameID: r.espnGameID || null,
          eventWeek: typeof r.eventWeek === 'number' ? r.eventWeek : (r.eventWeek != null ? Number(r.eventWeek) : null),
          // Maintain compatibility with Airtable-based UI fields (attachment-like array)
          eventCover: r.eventCoverURL ? [{ url: r.eventCoverURL }] : [],
          // Maintain compatibility with Airtable-style single-item arrays for teams
          homeTeam: homeTeamVal ? [homeTeamVal] : [],
          awayTeam: awayTeamVal ? [awayTeamVal] : [],
          homeTeamLink: r.home_team_id ? [r.home_team_id] : [],
          awayTeamLink: r.away_team_id ? [r.away_team_id] : [],
          homeTeamLogo: r.homeTeamLogo || null,
          awayTeamLogo: r.awayTeamLogo || null,
          // Convenience fields for downstream API usage
          homeTeamExternalId: r.homeTeamExternalID || null,
          awayTeamExternalId: r.awayTeamExternalID || null,
          homeTeamAbbreviation: r.homeTeamAbbreviation || null,
          awayTeamAbbreviation: r.awayTeamAbbreviation || null,
        };
        return res.status(200).json({ success: true, event });
      }
      // Airtable removed; Postgres-only
      return res.status(400).json({ success: false, error: 'Unsupported in Postgres mode' });
    } catch (err) {
      console.error('[api/admin/events/[eventId]] fetch error =>', err);
      return res.status(500).json({ success: false, error: 'Failed to fetch event' });
    }
  }

  if (req.method === 'PATCH') {
    try {
      const backend = getDataBackend();
      if (backend === 'postgres') {
        const { title, eventTime, league, homeTeamId, awayTeamId, coverUrl } = req.body || {};
        const sets = [];
        const vals = [];
        let i = 1;
        if (title !== undefined) { sets.push(`title = $${i++}`); vals.push(title); }
        if (eventTime !== undefined) { sets.push(`event_time = $${i++}`); vals.push(eventTime ? new Date(eventTime).toISOString() : null); }
        if (league !== undefined) { sets.push(`league = $${i++}`); vals.push(league); }
        if (homeTeamId !== undefined) { sets.push(`home_team_id = $${i++}`); vals.push(homeTeamId); }
        if (awayTeamId !== undefined) { sets.push(`away_team_id = $${i++}`); vals.push(awayTeamId); }
        if (coverUrl !== undefined) { sets.push(`cover_url = $${i++}`); vals.push(coverUrl || null); }
        if (sets.length === 0) {
          return res.status(400).json({ success: false, error: 'No updatable fields provided' });
        }
        vals.push(eventId);
        await query(`UPDATE events SET ${sets.join(', ')} WHERE id::text = $${i}`, vals);
        // Return the updated event
        const { rows } = await query(
          `SELECT e.id,
                  e.title AS "eventTitle",
                  e.event_time AS "eventTime",
                  e.league AS "eventLeague",
                  e.cover_url AS "eventCoverURL",
                  e.home_team_id,
                  e.away_team_id
             FROM events e
            WHERE e.id::text = $1
            LIMIT 1`,
          [eventId]
        );
        if (!rows || rows.length === 0) {
          return res.status(404).json({ success: false, error: 'Event not found after update' });
        }
        const r = rows[0];
        const event = {
          id: r.id,
          eventTitle: r.eventTitle,
          eventTime: r.eventTime,
          eventLeague: r.eventLeague,
          eventCover: r.eventCoverURL ? [{ url: r.eventCoverURL }] : [],
          homeTeamLink: r.home_team_id ? [r.home_team_id] : [],
          awayTeamLink: r.away_team_id ? [r.away_team_id] : [],
        };
        return res.status(200).json({ success: true, event });
      }
      // Airtable removed; Postgres-only
      return res.status(400).json({ success: false, error: 'Unsupported in Postgres mode' });
    } catch (err) {
      console.error('[api/admin/events/[eventId] PATCH] Error =>', err);
      return res.status(500).json({ success: false, error: 'Failed to update event' });
    }
  }

  return res.status(405).json({ success: false, error: 'Method not allowed' });
}