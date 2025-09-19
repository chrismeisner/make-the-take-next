import { getDataBackend } from '../../../lib/runtimeConfig';
import { createRepositories } from '../../../lib/dal/factory';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
  if (getDataBackend() !== 'postgres') {
    return res.status(400).json({ success: false, error: 'Awards are Postgres-only in this deployment' });
  }
  const code = String(req.query.code || '').trim();
  if (!code) return res.status(400).json({ success: false, error: 'Missing code' });

  try {
    const { awards } = createRepositories();
    const rec = await awards.getByCode(code);
    if (!rec) return res.status(404).json({ success: false, error: 'Code not found' });
    const now = Date.now();
    const isBefore = rec.valid_from ? new Date(rec.valid_from).getTime() > now : false;
    const isAfter = rec.valid_to ? new Date(rec.valid_to).getTime() < now : false;
    const status = isBefore || isAfter ? 'expired' : rec.status;
    return res.status(200).json({ success: true, code: rec.code, name: rec.name, tokens: Number(rec.tokens) || 0, status, redirectTeamSlug: rec.redirect_team_slug || null });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[awards/preview] error', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}


