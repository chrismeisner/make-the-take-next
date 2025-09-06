import { getToken } from "next-auth/jwt";
import Airtable from "airtable";
import { getDataBackend } from "../../../lib/runtimeConfig";
import { query } from "../../../lib/db/postgres";

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY })
  .base(process.env.AIRTABLE_BASE_ID);

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
    // Postgres path
    if (getDataBackend() === 'postgres') {
      const uniquePropIDs = [...new Set(propIDs.filter(Boolean))];
      const textIds = [];
      const uuidIds = [];
      for (const id of uniquePropIDs) {
        // naive UUID check: must contain hyphens and be length > 20
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
          airtableId: r.id, // legacy name used by UI for ids
          propID: r.prop_id || null,
          packID: r.pack_id || null,
          propShort: r.prop_short || '',
          propSummary: r.prop_summary || '',
          propStatus: r.prop_status || 'open',
          propResult: r.prop_result || '', // may be undefined if column not present
          gradingMode: r.grading_mode ? String(r.grading_mode).toLowerCase() : 'manual',
          formulaKey: r.formula_key || '',
          formulaParams: (typeof r.formula_params === 'string') ? r.formula_params : (r.formula_params ? JSON.stringify(r.formula_params) : ''),
          sideCount,
          sideLabels,
          // lookups (best-effort mappings)
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

    const uniquePropIDs = [...new Set(propIDs.filter(Boolean))];
    const chunks = [];
    const chunkSize = 50; // Airtable OR() practical limit safeguard
    for (let i = 0; i < uniquePropIDs.length; i += chunkSize) {
      chunks.push(uniquePropIDs.slice(i, i + chunkSize));
    }

    let allRecords = [];
    for (const chunk of chunks) {
      // Match against either business propID or Airtable RECORD_ID
      const orClauses = chunk.map((pid) => `OR({propID} = "${pid}", RECORD_ID() = "${pid}")`);
      const formula = orClauses.length === 1 ? orClauses[0] : `OR(${orClauses.join(',')})`;
      const records = await base("Props")
        .select({
          filterByFormula: formula,
          maxRecords: chunk.length,
        })
        .all();
      allRecords = allRecords.concat(records);
    }

    const props = allRecords.map((rec) => {
      const f = rec.fields;
      const sideCount = f.sideCount || 2;
      const sideLabels = Array.from({ length: sideCount }, (_, i) => {
        const letter = String.fromCharCode(65 + i);
        return f[`PropSide${letter}Short`] || f[`propSide${letter}Short`] || "";
      });
      return {
        airtableId: rec.id,
        propID: f.propID || rec.id,
        packID: f.packID || null,
        propShort: f.propShort || f.PropShort || "",
        propSummary: f.propSummary || "",
        propStatus: f.propStatus || "open",
        propResult: f.propResult || "",
        gradingMode: f.gradingMode ? String(f.gradingMode).toLowerCase() : "manual",
        formulaKey: f.formulaKey || "",
        // Read as string to avoid object mismatch; UI can display raw JSON
        formulaParams: (typeof f.formulaParams === 'string') ? f.formulaParams : (f.formulaParams ? JSON.stringify(f.formulaParams) : ""),
        sideCount,
        sideLabels,
        propESPNLookup: f.propESPNLookup || null,
        propLeagueLookup: f.propLeagueLookup || null,
        propEventTimeLookup: f.propEventTimeLookup || null,
        propEventMatchup: Array.isArray(f.propEventMatchup) ? f.propEventMatchup[0] : (f.propEventMatchup || null),
      };
    });

    // Fetch pack info for any props with a packID
    const uniquePackIDs = [...new Set(props.map(p => p.packID).filter(Boolean))];
    let packIdToInfo = {};
    if (uniquePackIDs.length > 0) {
      const packChunks = [];
      const packChunkSize = 50;
      for (let i = 0; i < uniquePackIDs.length; i += packChunkSize) {
        packChunks.push(uniquePackIDs.slice(i, i + packChunkSize));
      }
      for (const chunk of packChunks) {
        const formula = `OR(${chunk.map((pid) => `{packID} = "${pid}"`).join(',')})`;
        const records = await base("Packs")
          .select({
            filterByFormula: formula,
            maxRecords: chunk.length,
          })
          .all();
        records.forEach((rec) => {
          const f = rec.fields || {};
          const pid = f.packID || rec.id;
          packIdToInfo[pid] = {
            airtableId: rec.id,
            packID: f.packID || rec.id,
            packURL: f.packURL || "",
            packTitle: f.packTitle || "",
          };
        });
      }
    }

    const propsWithPackInfo = props.map(p => ({
      ...p,
      packInfo: p.packID ? packIdToInfo[p.packID] || null : null,
    }));

    return res.status(200).json({ success: true, props: propsWithPackInfo });
  } catch (error) {
    console.error("[admin/getPropsByIDs] Error:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
}

