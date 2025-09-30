import { getToken } from 'next-auth/jwt';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) return res.status(401).json({ success: false, error: 'Unauthorized' });

  try {
    const body = req.body || {};
    const { dataSource, formulaKey, eventId, espnGameID, playerId, metric, endpoints, resolved } = body;
    try {
      console.log('[MetricPreview] selection', {
        dataSource,
        formulaKey,
        eventId,
        espnGameID,
        playerId,
        metric,
        endpoints: endpoints || {},
        resolved,
      });
    } catch {}
    return res.status(200).json({ success: true });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message || 'Failed to log metric preview' });
  }
}
