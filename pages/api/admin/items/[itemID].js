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
            ? `SELECT i.item_id, i.title, i.image_url, i.tokens, i.brand, i.description, i.status, i.featured, i.require_address, i.item_type, i.external_url,
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
                WHERE i.item_id = $1
                 LIMIT 1`
            : `SELECT i.item_id, i.title, i.image_url, i.tokens, i.brand, i.description, i.status, i.featured, i.item_type, i.external_url,
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
                WHERE i.item_id = $1
                 LIMIT 1`;
        } else {
          selectSql = hasCol
            ? 'SELECT item_id, title, image_url, tokens, brand, description, status, featured, require_address, item_type, external_url FROM items WHERE item_id = $1 LIMIT 1'
            : 'SELECT item_id, title, image_url, tokens, brand, description, status, featured, item_type, external_url FROM items WHERE item_id = $1 LIMIT 1';
        }
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
            itemType: r.item_type || '',
            externalUrl: r.external_url || '',
          inventory: hasCodes ? {
            total: Number(r.inv_total || 0),
            available: Number(r.inv_available || 0),
            assigned: Number(r.inv_assigned || 0),
            redeemed: Number(r.inv_redeemed || 0),
          } : undefined,
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
      const { itemName, itemBrand, itemDescription, itemTokens, itemStatus, itemImage, featured, requireAddress, itemType, externalUrl } = req.body || {};
      if (backend === 'postgres') {
        const hasCol = await hasRequireAddressColumn();
        if (hasCol) {
          await query(
            `UPDATE items
               SET title = $1,
                   brand = $2,
                   description = $3,
                   tokens = $4,
                   status = $5,
                   image_url = $6,
                   featured = $7,
                   require_address = $8,
                   item_type = $9,
                   external_url = $10
             WHERE item_id = $11`,
            [
              itemName || '',
              itemBrand || '',
              itemDescription || '',
              Number(itemTokens) || 0,
              itemStatus || '',
              itemImage || '',
              Boolean(featured),
              Boolean(requireAddress),
              itemType || null,
              externalUrl || null,
              itemID,
            ]
          );
        } else {
          await query(
            `UPDATE items
               SET title = $1,
                   brand = $2,
                   description = $3,
                   tokens = $4,
                   status = $5,
                   image_url = $6,
                   featured = $7,
                   item_type = $8,
                   external_url = $9
             WHERE item_id = $10`,
            [
              itemName || '',
              itemBrand || '',
              itemDescription || '',
              Number(itemTokens) || 0,
              itemStatus || '',
              itemImage || '',
              Boolean(featured),
              itemType || null,
              externalUrl || null,
              itemID,
            ]
          );
        }
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
          requireAddress: Boolean(requireAddress),
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


