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

  const backend = getDataBackend();

  try {
    if (req.method === 'GET') {
      if (backend === 'postgres') {
        const { rows } = await query(
          'SELECT item_id, title, image_url, tokens, brand, description, status, featured FROM items ORDER BY created_at DESC'
        );
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
        return res.status(200).json({ success: true, items });
      } else {
        const recs = await base('Items').select({ view: 'Grid view' }).all();
        const items = recs.map((rec) => {
          const f = rec.fields || {};
          const imageArray = Array.isArray(f.itemImage) ? f.itemImage : [];
          const imageUrl = imageArray && imageArray.length > 0 ? imageArray[0].url : '';
          return {
            itemID: f.itemID || rec.id,
            itemName: f.itemName || '',
            itemTokens: Number(f.itemTokens) || 0,
            itemBrand: f.itemBrand || '',
            itemDescription: f.itemDescription || '',
            itemStatus: f.itemStatus || '',
            itemImage: imageUrl,
            featured: Boolean(f.featured),
          };
        });
        return res.status(200).json({ success: true, items });
      }
    }

    if (req.method === 'POST') {
      const { itemID, itemName, itemBrand, itemDescription, itemTokens, itemStatus, itemImage, featured } = req.body || {};
      if (!itemName || itemTokens == null || !itemStatus) {
        return res.status(400).json({ success: false, error: 'itemName, itemTokens, and itemStatus are required' });
      }

      if (backend === 'postgres') {
        let newItemId = itemID || null;
        if (!newItemId) {
          // derive a simple text id from name
          newItemId = String(itemName).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        }
        const insertSql = `
          INSERT INTO items (item_id, title, image_url, tokens, brand, description, status, featured)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
          ON CONFLICT (item_id) DO NOTHING
          RETURNING item_id
        `;
        const { rows } = await query(insertSql, [
          newItemId,
          itemName || '',
          itemImage || '',
          Number(itemTokens) || 0,
          itemBrand || '',
          itemDescription || '',
          itemStatus || '',
          Boolean(featured),
        ]);
        const createdId = rows[0]?.item_id || newItemId;
        return res.status(200).json({ success: true, itemID: createdId });
      } else {
        const fields = {
          itemID: itemID || undefined,
          itemName: itemName || '',
          itemBrand: itemBrand || '',
          itemDescription: itemDescription || '',
          itemTokens: Number(itemTokens) || 0,
          itemStatus: itemStatus || '',
          featured: Boolean(featured),
        };
        const created = await base('Items').create([{ fields }]);
        const createdId = created?.[0]?.fields?.itemID || created?.[0]?.id;
        return res.status(200).json({ success: true, itemID: createdId });
      }
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
  } catch (err) {
    console.error('[/api/admin/items] Error =>', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}


