// File: /pages/api/admin/etl-backfill.js
import Airtable from 'airtable';
import { query } from '../../../lib/db/postgres';

// Simple protection for staging: require header x-etl-key to match ETL_KEY
function authorize(req) {
  const key = req.headers['x-etl-key'] || req.query.key;
  const expected = process.env.ETL_KEY;
  if (!expected) return false;
  return String(key) === String(expected);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
  if (!authorize(req)) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY })
    .base(process.env.AIRTABLE_BASE_ID);

  const report = { teams: { upserted: 0 }, packs: { upserted: 0 }, props: { upserted: 0, skippedNoPackLink: 0 } };

  try {
    // 0) Upsert Teams first (for downstream references)
    const teamRecords = await base('Teams').select({ pageSize: 100, view: 'Grid view' }).all();
    for (const rec of teamRecords) {
      const f = rec.fields || {};
      const teamID = f.teamID || null;
      const name = f.teamNameFull || f.teamName || '';
      const league = f.teamLeague || null;
      const slug = f.teamSlug || f.teamAbbreviation || null;
      const logoUrl = Array.isArray(f.teamLogo) && f.teamLogo[0]?.url ? f.teamLogo[0].url : (f.teamLogoURL || null);
      const upsertSql = `
        INSERT INTO teams (team_id, name, team_slug, league, logo_url)
        VALUES ($1,$2,$3,$4,$5)
        ON CONFLICT (team_id) DO UPDATE SET
          name = EXCLUDED.name,
          team_slug = EXCLUDED.team_slug,
          league = EXCLUDED.league,
          logo_url = EXCLUDED.logo_url
        RETURNING id`;
      const { rows } = await query(upsertSql, [teamID, name, slug, league, logoUrl]);
      if (rows[0]?.id) report.teams.upserted += 1;
    }

    // 1) Upsert Packs (build map from Airtable record id -> packs.id)
    const packRecords = await base('Packs').select({ pageSize: 100, view: 'Grid view' }).all();
    const packIdMap = new Map();
    for (const rec of packRecords) {
      const f = rec.fields || {};
      const packURL = f.packURL;
      if (!packURL) continue;
      const title = f.packTitle || f.title || '';
      const league = f.packLeague || null;
      const prize = f.packPrize || null;
      const coverUrl = Array.isArray(f.packCover) && f.packCover[0]?.url ? f.packCover[0].url : null;
      const upsertSql = `
        INSERT INTO packs (pack_url, title, league, prize, cover_url)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (pack_url) DO UPDATE SET
          title = EXCLUDED.title,
          league = EXCLUDED.league,
          prize = EXCLUDED.prize,
          cover_url = EXCLUDED.cover_url
        RETURNING id
      `;
      const { rows } = await query(upsertSql, [packURL, title, league, prize, coverUrl]);
      const insertedId = rows[0]?.id;
      if (insertedId) {
        packIdMap.set(rec.id, insertedId);
        report.packs.upserted += 1;
      }
    }

    // 2) Upsert Props (link to pack_id when available via Airtable pack link)
    const propRecords = await base('Props').select({ pageSize: 100, view: 'Grid view' }).all();
    for (const rec of propRecords) {
      const f = rec.fields || {};
      const propID = f.propID;
      if (!propID) continue;

      // link to first linked pack if present
      let packId = null;
      const packLinks = Array.isArray(f.Packs) ? f.Packs : [];
      if (packLinks.length > 0) {
        const firstPackAirId = packLinks[0];
        packId = packIdMap.get(firstPackAirId) || null;
      }

      if (!packId && packLinks.length > 0) {
        // If pack not seen in this run (e.g., filtered view), try lookup by packURL
        try {
          const packRec = await base('Packs').find(packLinks[0]);
          const packURL = packRec?.fields?.packURL;
          if (packURL) {
            const { rows } = await query('SELECT id FROM packs WHERE pack_url = $1 LIMIT 1', [packURL]);
            packId = rows[0]?.id || null;
          }
        } catch {}
      }

      if (!packId && !Array.isArray(f.Event)) {
        // Not fatal; we can still import a prop without pack_id
        report.props.skippedNoPackLink += 0; // keep field present
      }

      const sideCount = Number(f.sideCount) || 2;
      const moneylineA = f.PropSideAMoneyline != null ? Number(f.PropSideAMoneyline) : null;
      const moneylineB = f.PropSideBMoneyline != null ? Number(f.PropSideBMoneyline) : null;
      const upsertSql = `
        INSERT INTO props (
          prop_id, prop_short, prop_summary, prop_type, prop_status,
          pack_id, side_count, moneyline_a, moneyline_b
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        ON CONFLICT (prop_id) DO UPDATE SET
          prop_short = EXCLUDED.prop_short,
          prop_summary = EXCLUDED.prop_summary,
          prop_type = EXCLUDED.prop_type,
          prop_status = EXCLUDED.prop_status,
          pack_id = EXCLUDED.pack_id,
          side_count = EXCLUDED.side_count,
          moneyline_a = EXCLUDED.moneyline_a,
          moneyline_b = EXCLUDED.moneyline_b
        RETURNING id
      `;
      const { rows } = await query(upsertSql, [
        propID,
        f.propShort || f.PropShort || '',
        f.propSummary || '',
        f.propType || null,
        f.propStatus || 'open',
        packId,
        sideCount,
        moneylineA,
        moneylineB,
      ]);
      if (rows[0]?.id) report.props.upserted += 1;
    }

    return res.status(200).json({ success: true, report });
  } catch (err) {
    console.error('[etl-backfill] Error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}


