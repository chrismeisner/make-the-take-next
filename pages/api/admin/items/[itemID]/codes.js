import { getToken } from 'next-auth/jwt';
import { query } from '../../../../../lib/db/postgres';

export default async function handler(req, res) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token || !token.userId) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  const { itemID } = req.query;
  if (!itemID) {
    return res.status(400).json({ success: false, error: 'Missing itemID' });
  }

  try {
    if (req.method === 'GET') {
      const status = String(req.query.status || '').trim();
      // Resolve item UUID by item_id
      const { rows: itemRows } = await query('SELECT id FROM items WHERE item_id = $1 LIMIT 1', [itemID]);
      if (itemRows.length === 0) return res.status(404).json({ success: false, error: 'Item not found' });
      const itemUuid = itemRows[0].id;

      let sql = `SELECT 
                   ic.id,
                   ic.code,
                   ic.status,
                   ic.assigned_to_profile_id,
                   ic.assigned_at,
                   ic.redeemed_at,
                   ic.created_at,
                   pr.profile_id AS assigned_profile_id_text,
                   r_latest.email AS redemption_email
                 FROM item_codes ic
                 LEFT JOIN profiles pr ON pr.id = ic.assigned_to_profile_id
                 LEFT JOIN LATERAL (
                   SELECT r.email
                     FROM redemptions r
                    WHERE r.item_code_id = ic.id
                    ORDER BY r.created_at DESC
                    LIMIT 1
                 ) r_latest ON TRUE
                WHERE ic.item_id = $1`;
      const params = [itemUuid];
      if (status) {
        sql += ' AND status = $2';
        params.push(status);
      }
      sql += ' ORDER BY created_at DESC LIMIT 500';
      const { rows } = await query(sql, params);
      const codes = rows.map((r) => ({
        id: r.id,
        code: r.code,
        status: r.status,
        assignedToProfileId: r.assigned_to_profile_id || null,
        assignedProfileID: r.assigned_profile_id_text || null,
        redemptionEmail: r.redemption_email || null,
        assignedAt: r.assigned_at || null,
        redeemedAt: r.redeemed_at || null,
        createdAt: r.created_at || null,
      }));
      return res.status(200).json({ success: true, codes });
    }

    if (req.method === 'POST') {
      const { codes } = req.body || {};
      if (!Array.isArray(codes) || codes.length === 0) {
        return res.status(400).json({ success: false, error: 'codes[] required' });
      }

      const normalized = Array.from(new Set(
        codes
          .map((c) => String(c || '').trim())
          .filter((c) => c.length > 0)
      ));
      if (normalized.length === 0) {
        return res.status(400).json({ success: false, error: 'No valid codes provided' });
      }

      // Resolve item UUID by item_id
      const { rows: itemRows } = await query('SELECT id FROM items WHERE item_id = $1 LIMIT 1', [itemID]);
      if (itemRows.length === 0) return res.status(404).json({ success: false, error: 'Item not found' });
      const itemUuid = itemRows[0].id;

      await query('BEGIN');
      try {
        let inserted = 0;
        for (const code of normalized) {
          try {
            await query(
              `INSERT INTO item_codes (item_id, code, status) VALUES ($1, $2, 'available')
               ON CONFLICT (item_id, code) DO NOTHING`,
              [itemUuid, code]
            );
            inserted += 1;
          } catch {}
        }
        await query('COMMIT');
        return res.status(200).json({ success: true, added: inserted, totalProvided: normalized.length });
      } catch (e) {
        await query('ROLLBACK');
        throw e;
      }
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[admin:item_codes] error', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}


