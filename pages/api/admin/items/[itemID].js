import { getToken } from 'next-auth/jwt';
import { getDataBackend } from '../../../../lib/runtimeConfig';
import { query } from '../../../../lib/db/postgres';
import Airtable from 'airtable';

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY })
  .base(process.env.AIRTABLE_BASE_ID);

export default async function handler(req, res) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token || !token.userId) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  const { itemID } = req.query;
  const backend = getDataBackend();

  try {
    if (req.method === 'GET') {
      if (backend === 'postgres') {
        const { rows } = await query(
          'SELECT item_id, title, image_url, tokens, brand, description, status, featured FROM items WHERE item_id = $1 LIMIT 1',
          [itemID]
        );
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
        };
        return res.status(200).json({ success: true, item });
      } else {
        const recs = await base('Items').select({ filterByFormula: `{itemID} = "${itemID}"`, maxRecords: 1 }).all();
        if (recs.length === 0) return res.status(404).json({ success: false, error: 'Item not found' });
        const f = recs[0].fields;
        const imageArray = Array.isArray(f.itemImage) ? f.itemImage : [];
        const imageUrl = imageArray && imageArray.length > 0 ? imageArray[0].url : '';
        const item = {
          itemID: f.itemID || recs[0].id,
          itemName: f.itemName || '',
          itemTokens: f.itemTokens || 0,
          itemBrand: f.itemBrand || '',
          itemDescription: f.itemDescription || '',
          itemStatus: f.itemStatus || '',
          itemImage: imageUrl,
          featured: Boolean(f.featured),
        };
        return res.status(200).json({ success: true, item });
      }
    }

    if (req.method === 'PUT') {
      const { itemName, itemBrand, itemDescription, itemTokens, itemStatus, itemImage, featured } = req.body || {};
      if (backend === 'postgres') {
        await query(
          `UPDATE items
             SET title = $1,
                 brand = $2,
                 description = $3,
                 tokens = $4,
                 status = $5,
                 image_url = $6,
                 featured = $7
           WHERE item_id = $8`,
          [
            itemName || '',
            itemBrand || '',
            itemDescription || '',
            Number(itemTokens) || 0,
            itemStatus || '',
            itemImage || '',
            Boolean(featured),
            itemID,
          ]
        );
        return res.status(200).json({ success: true });
      } else {
        const recs = await base('Items').select({ filterByFormula: `{itemID} = "${itemID}"`, maxRecords: 1 }).all();
        if (recs.length === 0) return res.status(404).json({ success: false, error: 'Item not found' });
        const recordId = recs[0].id;
        const updatePayload = {
          itemName: itemName || '',
          itemBrand: itemBrand || '',
          itemDescription: itemDescription || '',
          itemTokens: Number(itemTokens) || 0,
          itemStatus: itemStatus || '',
          featured: Boolean(featured),
        };
        await base('Items').update([{ id: recordId, fields: updatePayload }]);
        return res.status(200).json({ success: true });
      }
    }

    if (req.method === 'DELETE') {
      if (backend === 'postgres') {
        try {
          const result = await query('DELETE FROM items WHERE item_id = $1', [itemID]);
          return res.status(200).json({ success: true });
        } catch (pgErr) {
          // 23503 = foreign_key_violation
          if (pgErr && pgErr.code === '23503') {
            return res.status(409).json({ success: false, error: 'Cannot delete item: it is referenced by other records (e.g., exchanges).' });
          }
          throw pgErr;
        }
      } else {
        const recs = await base('Items').select({ filterByFormula: `{itemID} = "${itemID}"`, maxRecords: 1 }).all();
        if (recs.length === 0) return res.status(404).json({ success: false, error: 'Item not found' });
        await base('Items').destroy(recs[0].id);
        return res.status(200).json({ success: true });
      }
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
  } catch (err) {
    console.error('[/api/admin/items/:itemID] Error =>', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}


