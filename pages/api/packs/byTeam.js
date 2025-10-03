import { query } from "../../../lib/db/postgres";

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
  const teamSlug = String(req.query.teamSlug || '').trim();
  if (!teamSlug) return res.status(400).json({ success: false, error: 'Missing teamSlug' });
  try {
    const { rows } = await query(
      `WITH team AS (
         SELECT id FROM teams WHERE LOWER(team_slug) = LOWER($1) LIMIT 1
       ), link_packs AS (
         SELECT p.id
           FROM packs p
           JOIN events e ON e.id = p.event_id
           JOIN team t ON TRUE
          WHERE (e.home_team_id = t.id OR e.away_team_id = t.id)
         UNION
         SELECT pe.pack_id AS id
           FROM packs_events pe
           JOIN events e ON e.id = pe.event_id
           JOIN team t ON TRUE
          WHERE (e.home_team_id = t.id OR e.away_team_id = t.id)
       )
       SELECT p.id,
              p.pack_url,
              p.title,
              p.cover_url,
              p.pack_status,
              COALESCE(p.pack_open_time::text, pa.open_time::text) AS pack_open_time,
              COALESCE(p.pack_close_time::text, pa.close_time::text) AS pack_close_time,
              e.event_time::text AS event_time
         FROM packs p
         LEFT JOIN (
           SELECT pack_id, MIN(open_time) AS open_time, MAX(close_time) AS close_time
             FROM props
            GROUP BY pack_id
         ) pa ON pa.pack_id = p.id
         LEFT JOIN events e ON e.id = p.event_id
        WHERE p.id IN (SELECT id FROM link_packs)
          AND LOWER(COALESCE(p.pack_status,'')) IN ('active','open','coming-soon','live')
        ORDER BY COALESCE(e.event_time, p.created_at) ASC NULLS LAST
        LIMIT 50`,
      [teamSlug]
    );
    return res.status(200).json({ success: true, packs: rows || [] });
  } catch (err) {
    console.error('[byTeam] error', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}


