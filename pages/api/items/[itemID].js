import { getDataBackend } from '../../../lib/runtimeConfig';
import { query } from '../../../lib/db/postgres';
import Airtable from 'airtable';

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY })
  .base(process.env.AIRTABLE_BASE_ID);

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { itemID } = req.query;
  if (!itemID) {
    return res.status(400).json({ success: false, error: 'Missing itemID' });
  }

  const backend = getDataBackend();

  try {
    async function hasRequireAddressColumn() {
      try {
        const { rows } = await query(
          `SELECT 1 FROM information_schema.columns WHERE table_name = 'items' AND column_name = 'require_address' LIMIT 1`
        );
        return rows.length > 0;
      } catch (e) {
        return false;
      }
    }

    if (backend === 'postgres') {
      const hasCol = await hasRequireAddressColumn();
      const selectSql = hasCol
        ? 'SELECT item_id, title, image_url, tokens, brand, description, status, featured, require_address FROM items WHERE item_id = $1 LIMIT 1'
        : 'SELECT item_id, title, image_url, tokens, brand, description, status, featured FROM items WHERE item_id = $1 LIMIT 1';
      const { rows } = await query(selectSql, [itemID]);
      if (rows.length === 0) return res.status(404).json({ success: false, error: 'Item not found' });
      const r = rows[0];
      const item = {
        itemID: r.item_id,
        itemName: r.title || '',
        itemTokens: Number(r.tokens) || 0,
        itemBrand: r.brand || '',
        itemDescription: r.description || '',
        itemStatus: r.status || '',
        itemImage: r.image_url || '',
        featured: Boolean(r.featured),
        requireAddress: hasCol ? Boolean(r.require_address) : false,
      };
      return res.status(200).json({ success: true, item });
    } else {
      const recs = await base('Items').select({ filterByFormula: `{itemID} = "${itemID}"`, maxRecords: 1 }).all();
      if (recs.length === 0) return res.status(404).json({ success: false, error: 'Item not found' });
      const f = recs[0].fields || {};
      const imageArray = Array.isArray(f.itemImage) ? f.itemImage : [];
      const imageUrl = imageArray && imageArray.length > 0 ? imageArray[0].url : '';
      const item = {
        itemID: f.itemID || recs[0].id,
        itemName: f.itemName || '',
        itemTokens: Number(f.itemTokens) || 0,
        itemBrand: f.itemBrand || '',
        itemDescription: f.itemDescription || '',
        itemStatus: f.itemStatus || '',
        itemImage: imageUrl,
        featured: Boolean(f.featured),
        requireAddress: Boolean(f.requireAddress),
      };
      return res.status(200).json({ success: true, item });
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[GET /api/items/:itemID] error', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}

 
