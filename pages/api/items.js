import Airtable from 'airtable';

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY })
  .base(process.env.AIRTABLE_BASE_ID);

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
  try {
    const records = await base('Items')
      .select({
        fields: ['itemID', 'itemName', 'itemTokens', 'itemBrand', 'itemDescription', 'itemStatus'],
      })
      .all();

    const items = records.map((rec) => {
      const f = rec.fields;
      return {
        itemID:          f.itemID          || rec.id,
        itemName:        f.itemName        || '',
        itemTokens:      f.itemTokens      || 0,
        itemBrand:       f.itemBrand       || '',
        itemDescription: f.itemDescription || '',
        itemStatus:      f.itemStatus      || '',
      };
    });

    return res.status(200).json({ success: true, items });
  } catch (err) {
    console.error('[/api/items] Error =>', err);
    return res.status(500).json({ success: false, error: 'Server error fetching items' });
  }
}