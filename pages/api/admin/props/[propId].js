import { getToken } from 'next-auth/jwt';
import { getDataBackend } from '../../../../lib/runtimeConfig';
import { query } from '../../../../lib/db/postgres';

export default async function handler(req, res) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  const { propId } = req.query;
  if (!propId) {
    return res.status(400).json({ success: false, error: 'Missing propId' });
  }

  if (req.method === 'DELETE') {
    if (getDataBackend() === 'postgres') {
      try {
        // Resolve internal UUID for the prop via flexible lookup
        const { rows } = await query(
          `SELECT id FROM props WHERE id::text = $1 OR prop_id = $1 LIMIT 1`,
          [String(propId)]
        );
        if (!rows || rows.length === 0) {
          return res.status(404).json({ success: false, error: 'Prop not found' });
        }
        const internalId = rows[0].id;

        // Remove dependent takes first (props_teams cascades on prop delete)
        try {
          await query(`DELETE FROM takes WHERE prop_id = $1 OR prop_id_text = $2`, [internalId, String(propId)]);
        } catch {}

        // Delete the prop itself
        const del = await query(`DELETE FROM props WHERE id = $1`, [internalId]);
        return res.status(200).json({ success: true, deleted: del?.rowCount || 0 });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[api/admin/props/[propId] DELETE PG] error =>', err);
        return res.status(500).json({ success: false, error: 'Failed to delete prop' });
      }
    }
    return res.status(400).json({ success: false, error: 'Unsupported in Postgres mode' });
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  // Postgres backend
  if (getDataBackend() === 'postgres') {
    try {
      // Fetch prop + joined event basics + cover/logos for derivation
      const { rows } = await query(
        `SELECT p.*, 
                e.id            AS event_uuid,
                e.title         AS event_title,
                e.event_time    AS event_time,
                e.league        AS event_league,
                e.espn_game_id  AS espn_game_id,
                e.cover_url     AS event_cover_url,
                e.home_team     AS home_team,
                e.away_team     AS away_team,
                ht.logo_url     AS home_logo_url,
                at.logo_url     AS away_logo_url
           FROM props p
      LEFT JOIN events e ON e.id = p.event_id
      LEFT JOIN teams ht ON e.home_team_id = ht.id
      LEFT JOIN teams at ON e.away_team_id = at.id
          WHERE p.id::text = $1 OR p.prop_id = $1
          LIMIT 1`,
        [String(propId)]
      );
      if (!rows || rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Prop not found' });
      }
      const r = rows[0];

      // Linked teams (UUIDs)
      let teamIds = [];
      try {
        const teamRes = await query(
          `SELECT team_id FROM props_teams WHERE prop_id = $1`,
          [r.id]
        );
        teamIds = (teamRes.rows || []).map((tr) => tr.team_id).filter(Boolean);
      } catch {}

      const event = r.event_uuid ? {
        airtableId: r.event_uuid,
        eventTitle: r.event_title || '',
        eventTime: r.event_time || null,
        eventLeague: r.event_league || '',
        homeTeamAbbreviation: '',
        awayTeamAbbreviation: '',
        tankGameID: '',
        espnGameID: r.espn_game_id || '',
      } : null;

      // Derive cover source from stored cover_url
      const deriveCoverSource = () => {
        try {
          const cover = r.cover_url || null;
          if (!cover) return 'event';
          if (r.home_logo_url && cover === r.home_logo_url) return 'homeTeam';
          if (r.away_logo_url && cover === r.away_logo_url) return 'awayTeam';
          if (r.event_cover_url && cover === r.event_cover_url) return 'event';
          return 'custom';
        } catch { return 'event'; }
      };

      const prop = {
        airtableId: r.id,
        propID: r.prop_id || r.id,
        propShort: r.prop_short || '',
        propSummary: r.prop_summary || '',
        gradingMode: r.grading_mode ? String(r.grading_mode).toLowerCase() : 'manual',
        formulaKey: r.formula_key || '',
        formulaParams: r.formula_params ? (typeof r.formula_params === 'string' ? r.formula_params : JSON.stringify(r.formula_params)) : '',
        PropSideAShort: r.prop_side_a_short || '',
        PropSideATake: r.prop_side_a_take || '',
        PropSideAMoneyline: r.moneyline_a ?? null,
        PropSideBShort: r.prop_side_b_short || '',
        PropSideBTake: r.prop_side_b_take || '',
        PropSideBMoneyline: r.moneyline_b ?? null,
        propType: r.prop_type || 'moneyline',
        propStatus: r.prop_status || 'open',
        propValueModel: 'vegas',
        teams: teamIds,
        propOpenTime: r.open_time || null,
        propCloseTime: r.close_time || null,
        propCoverSource: deriveCoverSource(),
        coverUrl: r.cover_url || null,
        propESPNLookup: '',
        propLeagueLookup: '',
        event,
      };
      return res.status(200).json({ success: true, prop });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[api/admin/props/[propId]] PG error =>', err);
      return res.status(500).json({ success: false, error: 'Failed to fetch prop' });
    }
  }

  return res.status(400).json({ success: false, error: 'Unsupported in Postgres mode' });
}


