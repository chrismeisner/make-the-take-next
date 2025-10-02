import { getToken } from 'next-auth/jwt';
import { query } from '../../../lib/db/postgres';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  // Require admin session
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
  } catch {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  const {
    limit: limitParam = '100',
    offset: offsetParam = '0',
    eventKey = '',
    severity = '',
    packUrl = '',
  } = req.query;

  const limit = Math.max(1, Math.min(500, Number.parseInt(String(limitParam), 10) || 100));
  const offset = Math.max(0, Number.parseInt(String(offsetParam), 10) || 0);

  const where = [];
  const params = [];
  function add(cond, val) {
    params.push(val);
    const idx = params.length;
    where.push(cond.replace(/\$IDX/g, `$${idx}`));
  }
  if (eventKey) add('event_key = $IDX', String(eventKey));
  if (severity) add('severity = $IDX', String(severity));
  if (packUrl) add('pack_url = $IDX', String(packUrl));

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  try {
    const { rows } = await query(
      `SELECT id, created_at, event_key, severity, source, pack_id, pack_url, prop_id, event_id, profile_id, message, details
         FROM admin_event_audit_log
         ${whereSql}
         ORDER BY created_at DESC
         LIMIT $${params.length + 1}
         OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );
    return res.status(200).json({ success: true, logs: rows });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
}


