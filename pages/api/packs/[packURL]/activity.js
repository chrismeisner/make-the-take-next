import { query } from '../../../../lib/db/postgres';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { packURL, limit: limitParam, cursor } = req.query;
  if (!packURL) {
    return res.status(400).json({ success: false, error: 'Missing packURL parameter' });
  }

  const limit = Math.max(1, Math.min(100, Number(limitParam) || 50));

  // Keyset pagination: cursor is "<iso>__<id>"
  let cursorTime = null;
  let cursorId = null;
  if (cursor && typeof cursor === 'string') {
    const parts = cursor.split('__');
    if (parts.length === 2) {
      const ts = new Date(parts[0]);
      if (!isNaN(ts.getTime())) cursorTime = ts.toISOString();
      // takes.id is UUID, keep as string
      const idStr = String(parts[1]);
      if (idStr && idStr.length > 0) cursorId = idStr;
    }
  }

  try {
    // Resolve pack id from pack_url
    const { rows: packRows } = await query('SELECT id FROM packs WHERE pack_url = $1 LIMIT 1', [packURL]);
    const packId = packRows?.[0]?.id || null;
    if (!packId) {
      return res.status(404).json({ success: false, error: 'Pack not found' });
    }

    // Build SQL with optional cursor
    const params = [packId, limit + 1];
    let whereCursor = '';
    if (cursorTime && cursorId != null) {
      params.push(cursorTime, cursorId);
      whereCursor = 'AND (t.created_at, t.id) < ($3::timestamptz, $4::uuid)';
    }

    const sql = `
      SELECT
        t.id                AS take_id,
        t.created_at        AS created_at,
        t.prop_side         AS side,
        t.take_result       AS result,
        t.take_status       AS status,
        p.prop_id           AS prop_id,
        COALESCE(NULLIF(p.prop_short, ''), NULLIF(p.prop_summary, ''), p.prop_id) AS prop_label,
        p.prop_side_a_take  AS prop_side_a_take,
        p.prop_side_b_take  AS prop_side_b_take,
        pr.profile_id       AS profile_id,
        t.take_mobile       AS phone
      FROM takes t
      JOIN props p ON p.id = t.prop_id
      LEFT JOIN profiles pr ON pr.mobile_e164 = t.take_mobile
      WHERE p.pack_id = $1
      ${whereCursor}
      ORDER BY t.created_at DESC, t.id DESC
      LIMIT $2`;

    const { rows } = await query(sql, params);

    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit).map((r) => {
      const phone = r.phone || '';
      const phoneMasked = phone ? phone.replace(/^(\+?\d{1,3})(.*)(\d{4})$/, (_, cc, mid, last) => `${cc}***${last}`) : null;
      const takeText = r.side === 'A' ? (r.prop_side_a_take || null) : (r.prop_side_b_take || null);
      return {
        takeID: String(r.take_id),
        createdAt: new Date(r.created_at).toISOString(),
        side: r.side,
        result: r.result || null,
        status: r.status,
        propID: r.prop_id,
        propLabel: r.prop_label,
        takeText,
        profileID: r.profile_id || null,
        phoneMasked,
      };
    });

    let nextCursor = null;
    if (hasMore) {
      const last = items[items.length - 1];
      if (last) {
        nextCursor = `${last.createdAt}__${last.takeID}`;
      }
    }

    return res.status(200).json({ success: true, items, nextCursor });
  } catch (err) {
    console.error('[api/packs/[packURL]/activity] Error =>', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}


