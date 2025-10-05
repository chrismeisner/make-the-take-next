import { query } from "../../../../lib/db/postgres";

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
  const { packURL } = req.query;
  const profileID = req.query.profileID;
  if (!packURL || !profileID) {
    return res.status(400).json({ success: false, error: 'Missing packURL or profileID' });
  }

  try {
    // Resolve pack id
    const { rows: packRows } = await query('SELECT id FROM packs WHERE pack_url = $1 LIMIT 1', [packURL]);
    const packId = packRows?.[0]?.id || null;
    if (!packId) return res.status(404).json({ success: false, error: 'Pack not found' });

    // Resolve user phone by profileID
    const { rows: profRows } = await query('SELECT mobile_e164 FROM profiles WHERE profile_id = $1 LIMIT 1', [profileID]);
    const phone = profRows?.[0]?.mobile_e164 || null;
    if (!phone) return res.status(404).json({ success: false, error: 'User not found' });

    // Pull latest takes for this user on this pack, join prop text
    const { rows } = await query(
      `SELECT 
         p.prop_id AS prop_id_text,
         COALESCE(p.prop_short, p.prop_summary, p.prop_id) AS prop_label,
         p.prop_side_a_take,
         p.prop_side_b_take,
         p.prop_side_a_short,
         p.prop_side_b_short,
         t.prop_side,
         t.take_result,
         COALESCE(t.take_pts, 0) AS take_pts
       FROM takes t
       JOIN props p ON p.id = t.prop_id
      WHERE t.take_status = 'latest'
        AND p.pack_id = $1
        AND t.take_mobile = $2
      ORDER BY p.prop_order ASC NULLS LAST, t.created_at ASC`,
      [packId, phone]
    );

    const items = rows.map((r) => {
      const side = String(r.prop_side || '').toUpperCase() === 'B' ? 'B' : 'A';
      const statement = side === 'A'
        ? (r.prop_side_a_take || r.prop_side_a_short || 'A')
        : (r.prop_side_b_take || r.prop_side_b_short || 'B');
      return {
        propID: r.prop_id_text,
        side,
        statement,
        result: r.take_result || null,
        points: Number(r.take_pts || 0),
      };
    });

    return res.status(200).json({ success: true, items });
  } catch (err) {
    console.error('[api/packs/[packURL]/userTakes] Error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}


