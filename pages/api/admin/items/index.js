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

    async function hasItemCodesTable() {
      try {
        const { rows } = await query(
          `SELECT 1 FROM information_schema.tables WHERE table_name = 'item_codes' LIMIT 1`
        );
        return rows.length > 0;
      } catch (e) {
        return false;
      }
    }

    if (req.method === 'GET') {
      if (backend === 'postgres') {
        const [hasCol, hasCodes] = await Promise.all([
          hasRequireAddressColumn(),
          hasItemCodesTable(),
        ]);
        let selectSql;
        if (hasCodes) {
          selectSql = hasCol
            ? `SELECT i.item_id, i.title, i.image_url, i.tokens, i.brand, i.description, i.status, i.featured, i.require_address,
                       COALESCE(ic.total,0) AS inv_total,
                       COALESCE(ic.available,0) AS inv_available,
                       COALESCE(ic.assigned,0) AS inv_assigned,
                       COALESCE(ic.redeemed,0) AS inv_redeemed
                 FROM items i
                 LEFT JOIN LATERAL (
                   SELECT COUNT(*) AS total,
                          COUNT(*) FILTER (WHERE status = 'available') AS available,
                          COUNT(*) FILTER (WHERE status = 'assigned') AS assigned,
                          COUNT(*) FILTER (WHERE status = 'redeemed') AS redeemed
                     FROM item_codes c
                    WHERE c.item_id = i.id
                 ) ic ON TRUE
                 ORDER BY i.created_at DESC`
            : `SELECT i.item_id, i.title, i.image_url, i.tokens, i.brand, i.description, i.status, i.featured,
                       COALESCE(ic.total,0) AS inv_total,
                       COALESCE(ic.available,0) AS inv_available,
                       COALESCE(ic.assigned,0) AS inv_assigned,
                       COALESCE(ic.redeemed,0) AS inv_redeemed
                 FROM items i
                 LEFT JOIN LATERAL (
                   SELECT COUNT(*) AS total,
                          COUNT(*) FILTER (WHERE status = 'available') AS available,
                          COUNT(*) FILTER (WHERE status = 'assigned') AS assigned,
                          COUNT(*) FILTER (WHERE status = 'redeemed') AS redeemed
                     FROM item_codes c
                    WHERE c.item_id = i.id
                 ) ic ON TRUE
                 ORDER BY i.created_at DESC`;
        } else {
          selectSql = hasCol
            ? 'SELECT item_id, title, image_url, tokens, brand, description, status, featured, require_address FROM items ORDER BY created_at DESC'
            : 'SELECT item_id, title, image_url, tokens, brand, description, status, featured FROM items ORDER BY created_at DESC';
        }
        const { rows } = await query(selectSql);
        const items = rows.map(r => ({
          itemID: r.item_id,
          itemName: r.title || '',
          itemTokens: Number(r.tokens) || 0,
          itemBrand: r.brand || '',
          itemDescription: r.description || '',
          itemStatus: r.status || '',
          itemImage: r.image_url || '',
          featured: Boolean(r.featured),
          requireAddress: hasCol ? Boolean(r.require_address) : false,
          inventory: hasCodes ? {
            total: Number(r.inv_total || 0),
            available: Number(r.inv_available || 0),
            assigned: Number(r.inv_assigned || 0),
            redeemed: Number(r.inv_redeemed || 0),
          } : undefined,
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
      const { itemID, itemName, itemBrand, itemDescription, itemTokens, itemStatus, itemImage, featured, requireAddress } = req.body || {};
      if (!itemName || itemTokens == null || !itemStatus) {
        return res.status(400).json({ success: false, error: 'itemName, itemTokens, and itemStatus are required' });
      }

      if (backend === 'postgres') {
        const hasCol = await hasRequireAddressColumn();
        let newItemId = itemID || null;
        if (!newItemId) {
          // derive a simple text id from name
          newItemId = String(itemName).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        }
        const insertSql = hasCol
          ? `INSERT INTO items (item_id, title, image_url, tokens, brand, description, status, featured, require_address)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
             ON CONFLICT (item_id) DO NOTHING
             RETURNING item_id`
          : `INSERT INTO items (item_id, title, image_url, tokens, brand, description, status, featured)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
             ON CONFLICT (item_id) DO NOTHING
             RETURNING item_id`;
        const params = hasCol
          ? [
              newItemId,
              itemName || '',
              itemImage || '',
              Number(itemTokens) || 0,
              itemBrand || '',
              itemDescription || '',
              itemStatus || '',
              Boolean(featured),
              Boolean(requireAddress),
            ]
          : [
              newItemId,
              itemName || '',
              itemImage || '',
              Number(itemTokens) || 0,
              itemBrand || '',
              itemDescription || '',
              itemStatus || '',
              Boolean(featured),
            ];
        const { rows } = await query(insertSql, params);
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
          requireAddress: Boolean(requireAddress),
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


