import { getToken } from "next-auth/jwt";
import { getDataBackend } from "../../../lib/runtimeConfig";
import { query } from "../../../lib/db/postgres";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) {
    return res.status(401).json({ success: false, error: "Unauthorized" });
  }

  const { propIDs } = req.body || {};
  if (!Array.isArray(propIDs) || propIDs.length === 0) {
    return res.status(400).json({ success: false, error: "propIDs must be a non-empty array" });
  }

  try {
    // Postgres path only
    if (getDataBackend() === 'postgres') {
      const uniquePropIDs = [...new Set(propIDs.filter(Boolean))];
      const textIds = [];
      const uuidIds = [];
      for (const id of uniquePropIDs) {
        if (typeof id === 'string' && id.includes('-') && id.length > 20) uuidIds.push(id);
        else textIds.push(id);
      }
      const params = [];
      let whereClauses = [];
      if (textIds.length) {
        params.push(textIds);
        whereClauses.push(`p.prop_id = ANY($${params.length})`);
      }
      if (uuidIds.length) {
        params.push(uuidIds);
        whereClauses.push(`p.id = ANY($${params.length}::uuid[])`);
      }
      if (whereClauses.length === 0) {
        return res.status(400).json({ success: false, error: 'No valid propIDs provided' });
      }
      const sql = `
        SELECT p.*,
               e.event_time AS event_time,
               e.league AS event_league,
               e.week AS event_week,
               e.espn_game_id,
               pk.pack_url,
               pk.title AS pack_title,
               pk.pack_id AS pack_text_id
          FROM props p
     LEFT JOIN events e ON e.id = p.event_id
     LEFT JOIN packs pk ON pk.id = p.pack_id
         WHERE ${whereClauses.join(' OR ')}
      `;
      const { rows } = await query(sql, params);
      const props = rows.map((r) => {
        const sideCount = r.side_count || 2;
        const sideLabels = Array.from({ length: sideCount }, (_, i) => {
          const letter = String.fromCharCode(65 + i);
          if (letter === 'A') return r.prop_side_a_short || '';
          if (letter === 'B') return r.prop_side_b_short || '';
          return '';
        });
        return {
          airtableId: r.id,
          propID: r.prop_id || null,
          packID: r.pack_id || null,
          propShort: r.prop_short || '',
          propSummary: r.prop_summary || '',
          propStatus: r.prop_status || 'open',
          propResult: r.prop_result || '',
          gradingMode: r.grading_mode ? String(r.grading_mode).toLowerCase() : 'manual',
          formulaKey: r.formula_key || '',
          formulaParams: (typeof r.formula_params === 'string') ? r.formula_params : (r.formula_params ? JSON.stringify(r.formula_params) : ''),
          sideCount,
          sideLabels,
          propESPNLookup: r.espn_game_id || null,
          propLeagueLookup: r.event_league || null,
          propEventTimeLookup: r.event_time || null,
          propEventWeek: r.event_week || null,
          propEventMatchup: null,
          packInfo: r.pack_id ? { packURL: r.pack_url || '', packTitle: r.pack_title || r.title || '', packID: r.pack_text_id || r.pack_id } : null,
        };
      });
      return res.status(200).json({ success: true, props });
    }

    return res.status(400).json({ success: false, error: 'Unsupported in Postgres mode' });
  } catch (error) {
    console.error("[admin/getPropsByIDs] Error:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
}

