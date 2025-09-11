import Airtable from 'airtable';
import { getDataBackend } from "../../lib/runtimeConfig";
import { query } from "../../lib/db/postgres";

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY })
  .base(process.env.AIRTABLE_BASE_ID);

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
  try {
    const backend = getDataBackend();
    // Log backend choice and minimal request context
    try { console.log('[/api/items] start', { backend }); } catch {}
    if (backend === 'postgres') {
      const sql = 'SELECT item_id, title, image_url, tokens, brand, description, status, featured FROM items ORDER BY title';
      try { console.log('[/api/items] PG query:', sql); } catch {}
      const { rows } = await query(sql);
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
    console.error('[/api/items] Error =>', err);
    return res.status(500).json({ success: false, error: 'Server error fetching items' });
  }
}