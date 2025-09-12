// File: pages/api/leaderboard.js
import { aggregateTakeStats } from '../../lib/leaderboard';
import { query } from '../../lib/db/postgres';

export default async function handler(req, res) {
  const { subjectID, packURL } = req.query;

  try {
    // Enrich phones with profileIDs
    const { rows: profRows } = await query('SELECT mobile_e164, profile_id FROM profiles');
    const phoneToProfileID = new Map(profRows.map(r => [r.mobile_e164, r.profile_id]));

    let propIdFilter = null;
    if (packURL) {
      const { rows: propRows } = await query(
        `SELECT p.prop_id FROM props p
           JOIN packs k ON p.pack_id = k.id
          WHERE k.pack_url = $1`,
        [packURL]
      );
      propIdFilter = new Set(propRows.map(r => r.prop_id));
      if (propRows.length === 0) {
        return res.status(200).json({ success: true, leaderboard: [] });
      }
    }

    const { rows: takeRows } = await query(
      `SELECT take_mobile, prop_id_text, take_result, COALESCE(take_pts, 0) AS take_pts
         FROM takes
        WHERE take_status = 'latest'`
    );

    let filtered = takeRows;
    if (propIdFilter) {
      filtered = filtered.filter(t => propIdFilter.has(t.prop_id_text));
    }
    if (subjectID) {
      const { rows: subjProps } = await query(
        `SELECT prop_id FROM props WHERE prop_summary ILIKE $1`,
        [ `%${subjectID}%` ]
      );
      const subjSet = new Set(subjProps.map(r => r.prop_id));
      filtered = filtered.filter(t => subjSet.has(t.prop_id_text));
    }

    const pseudoTakes = filtered.map((r) => ({ fields: { takeMobile: r.take_mobile, takeResult: r.take_result || null, takePTS: Number(r.take_pts) || 0, takeStatus: 'latest' } }));
    const statsList = aggregateTakeStats(pseudoTakes);
    const leaderboard = statsList.map((s) => ({
      phone: s.phone,
      takes: s.takes,
      points: s.points,
      profileID: phoneToProfileID.get(s.phone) || null,
      won: s.won,
      lost: s.lost,
      pushed: s.pushed,
    }));
    return res.status(200).json({ success: true, leaderboard });
  } catch (err) {
	const meta = { name: err?.name, message: err?.message, code: err?.code, stack: err?.stack };
	try { console.error('[API /leaderboard] Error:', meta); } catch {}
	res.status(500).json({ success: false, error: 'Failed to fetch leaderboard', meta });
  }
}
