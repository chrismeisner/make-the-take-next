import { getDataBackend } from "../../../lib/runtimeConfig";
import { query } from "../../../lib/db/postgres";

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { itemID } = req.query;

  if (!itemID) {
    return res.status(400).json({ success: false, error: 'Item ID is required' });
  }

  try {
    const backend = getDataBackend();
    
    if (backend === 'postgres') {
      // Fetch item from Postgres database
      const { rows } = await query(
        'SELECT item_id, title, image_url, tokens, brand, description, status, featured FROM items WHERE item_id = $1 LIMIT 1',
        [itemID]
      );

      if (rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Item not found' });
      }

      const row = rows[0];
      const item = {
        itemID: row.item_id,
        itemName: row.title || '',
        itemBrand: row.brand || '',
        itemTokens: Number(row.tokens) || 0,
        itemDescription: row.description || '',
        itemStatus: row.status || '',
        itemImage: row.image_url || '',
        featured: Boolean(row.featured)
      };

      return res.status(200).json({ success: true, item });
    } else {
      // Fallback for non-Postgres backends (Airtable, etc.)
      return res.status(501).json({ 
        success: false, 
        error: 'Non-Postgres backends not implemented for individual item lookup' 
      });
    }

  } catch (error) {
    console.error('Error fetching item details:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}
