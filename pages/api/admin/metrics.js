import { getToken } from 'next-auth/jwt';
import { createRepositories } from '../../../lib/dal/factory';

export default async function handler(req, res) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) return res.status(401).json({ success: false, error: 'Unauthorized' });

  const { metrics } = createRepositories();
  await metrics.ensureSchema();

  if (req.method === 'GET') {
    try {
      const { league, entity, scope } = req.query || {};
      const rows = await metrics.list(String(league || '').toLowerCase() || null, String(entity || '').toLowerCase() || null, String(scope || '').toLowerCase() || null);
      return res.status(200).json({ success: true, metrics: rows });
    } catch (e) {
      return res.status(500).json({ success: false, error: e.message || 'Failed to read metrics' });
    }
  }

  if (req.method === 'POST') {
    try {
      const body = req.body || {};
      const items = Array.isArray(body?.items) ? body.items : [];
      const inserted = await metrics.upsertMany(items.map((m) => ({
        league: String(m.league || '').toLowerCase(),
        entity: String(m.entity || '').toLowerCase(),
        scope: String(m.scope || '').toLowerCase(),
        key: String(m.key),
        label: String(m.label || m.key),
        description: m.description || null,
        source_key: m.source_key || {},
      })));
      return res.status(200).json({ success: true, inserted });
    } catch (e) {
      return res.status(500).json({ success: false, error: e.message || 'Failed to upsert metrics' });
    }
  }

  return res.status(405).json({ success: false, error: 'Method not allowed' });
}


