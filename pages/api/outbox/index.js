// File: pages/api/outbox/index.js
import { getToken } from 'next-auth/jwt';
import { query } from '../../../lib/db/postgres';

export default async function handler(req, res) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  if (req.method === 'GET') {
    try {
      const { rows } = await query(
        `SELECT o.id,
                o.message,
                o.status,
                o.created_at,
                ARRAY_REMOVE(ARRAY_AGG(orx.profile_id), NULL) AS profile_ids
           FROM outbox o
      LEFT JOIN outbox_recipients orx ON orx.outbox_id = o.id
       GROUP BY o.id
       ORDER BY o.created_at DESC
         LIMIT 100`
      );
      return res.status(200).json({ success: true, outbox: rows });
    } catch (error) {
      console.error('[Outbox API] Error fetching records:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  } else if (req.method === 'POST') {
    const { outboxMessage, outboxRecipients, outboxStatus } = req.body || {};
    try {
      const status = outboxStatus || 'draft';
      const { rows } = await query(
        `INSERT INTO outbox (message, status)
         VALUES ($1,$2)
         RETURNING id, message, status, created_at`,
        [outboxMessage || null, status]
      );
      const rec = rows[0];
      if (Array.isArray(outboxRecipients) && outboxRecipients.length) {
        const values = [];
        const params = [];
        let i = 1;
        for (const pid of outboxRecipients) {
          values.push(`($${i++}, $${i++})`);
          params.push(rec.id, pid);
        }
        await query(
          `INSERT INTO outbox_recipients (outbox_id, profile_id)
           VALUES ${values.join(', ')}`,
          params
        );
      }
      return res.status(200).json({ success: true, record: rec });
    } catch (error) {
      console.error('[Outbox API] Error creating record:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  } else {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
}
