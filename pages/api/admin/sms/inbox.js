import { getToken } from 'next-auth/jwt';
import { query } from '../../../../lib/db/postgres';

export default async function handler(req, res) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) return res.status(401).json({ success: false, error: 'Unauthorized' });

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const { q, phone, limit, before } = req.query;
    const params = [];
    const where = [];
    if (phone) {
      params.push(String(phone));
      where.push(`from_e164 = $${params.length}`);
    }
    if (q) {
      params.push(`%${String(q)}%`);
      where.push(`(body ILIKE $${params.length} OR matched_keyword ILIKE $${params.length})`);
    }
    if (before) {
      params.push(new Date(before));
      where.push(`received_at < $${params.length}`);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const max = Math.max(1, Math.min(200, parseInt(limit || '100', 10)));
    params.push(max);
    const { rows } = await query(
      `SELECT id, message_sid, from_e164, to_e164, body, matched_keyword, webhook_status, received_at
         FROM sms_inbox
         ${whereSql}
         ORDER BY received_at DESC
         LIMIT $${params.length}`,
      params
    );
    return res.status(200).json({ success: true, inbox: rows });
  } catch (e) {
    console.error('[admin/sms/inbox] error =>', e?.message || e);
    return res.status(500).json({ success: false, error: 'Failed to load inbox' });
  }
}


