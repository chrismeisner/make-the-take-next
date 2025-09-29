import Airtable from 'airtable';
import { getDataBackend } from "../../lib/runtimeConfig";
import { query } from "../../lib/db/postgres";
import { withRouteTiming } from "../../lib/timing";

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY })
  .base(process.env.AIRTABLE_BASE_ID);

async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
  try {
    const backend = getDataBackend();
    // Log backend choice and minimal request context
    try { console.log('[/api/items] start', { backend }); } catch {}
    if (backend === 'postgres') {
      const limit = Math.min(Number.parseInt(req.query.limit || '24', 10), 100);
      const teamSlug = (req.query.teamSlug ? String(req.query.teamSlug) : '').trim();
      let rows = [];
      if (teamSlug) {
        const sql = `WITH team AS (
  SELECT id FROM teams WHERE lower(team_slug) = lower($2) LIMIT 1
)
SELECT i.item_id,
       i.title,
       COALESCE(iti.image_url, i.image_url) AS image_url,
       i.tokens,
       i.brand,
       i.description,
       i.status,
       i.featured
  FROM items i
  LEFT JOIN team t ON TRUE
  LEFT JOIN item_team_images iti ON iti.item_id = i.id AND iti.team_id = t.id
 WHERE i.status = $1
 ORDER BY i.tokens ASC, i.title ASC
 LIMIT $3`;
        try { console.log('[/api/items] PG query (team-aware):', { limit, teamSlug }); } catch {}
        const res = await query(sql, ['Available', teamSlug, limit]);
        rows = res.rows;
      } else {
        const sql = 'SELECT item_id, title, image_url, tokens, brand, description, status, featured FROM items WHERE status = $1 ORDER BY tokens ASC, title ASC LIMIT $2';
        try { console.log('[/api/items] PG query:', sql, { limit }); } catch {}
        const res = await query(sql, ['Available', limit]);
        rows = res.rows;
      }
      try { console.log('[/api/items] PG rows:', rows.length); } catch {}
      const items = rows.map(r => ({
        itemID: r.item_id,
        itemName: r.title || '',
        itemTokens: Number(r.tokens) || 0,
        itemBrand: r.brand || '',
        itemDescription: r.description || '',
        itemStatus: r.status || '',
        itemImage: r.image_url || '',
        featured: Boolean(r.featured),
      }));
      try { console.log('[/api/items] PG mapped items:', items.length); } catch {}
      return res.status(200).json({ success: true, items });
    }
    const records = await base('Items')
      .select({
        fields: ['itemID', 'itemName', 'itemTokens', 'itemBrand', 'itemDescription', 'itemStatus', 'itemImage', 'featured'],
      })
      .all();

    const items = records.map((rec) => {
      const f = rec.fields;
      const imageArray = Array.isArray(f.itemImage) ? f.itemImage : [];
      const imageUrl = imageArray && imageArray.length > 0 ? imageArray[0].url : '';
      return {
        itemID:          f.itemID          || rec.id,
        itemName:        f.itemName        || '',
        itemTokens:      f.itemTokens      || 0,
        itemBrand:       f.itemBrand       || '',
        itemDescription: f.itemDescription || '',
        itemStatus:      f.itemStatus      || '',
        itemImage:       imageUrl,
        featured:        Boolean(f.featured),
      };
    });

    try { console.log('[/api/items] AT mapped items:', items.length); } catch {}
    return res.status(200).json({ success: true, items });
  } catch (err) {
    const meta = {
      name: err?.name,
      message: err?.message,
      code: err?.code,
      stack: err?.stack,
    };
    try { console.error('[/api/items] Error =>', meta); } catch {}
    return res.status(500).json({ success: false, error: 'Server error fetching items', meta });
  }
}

export default withRouteTiming('/api/items', handler);