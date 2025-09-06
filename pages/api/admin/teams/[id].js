import { getToken } from 'next-auth/jwt';
import { createRepositories } from '../../../../lib/dal/factory';

export default async function handler(req, res) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  const { id } = req.query;
  const { teams } = createRepositories();

  if (req.method === 'GET') {
    try {
      const team = await teams.getById(id);
      if (!team) return res.status(404).json({ success: false, error: 'Not found' });
      return res.status(200).json({ success: true, team });
    } catch (e) {
      console.error('[admin/teams/:id] get error', e);
      return res.status(500).json({ success: false, error: e.message });
    }
  }

  if (req.method === 'PUT') {
    try {
      const updated = await teams.updateOne(id, req.body || {});
      if (!updated) return res.status(404).json({ success: false, error: 'Not found' });
      return res.status(200).json({ success: true, team: updated });
    } catch (e) {
      console.error('[admin/teams/:id] update error', e);
      return res.status(500).json({ success: false, error: e.message });
    }
  }

  if (req.method === 'DELETE') {
    try {
      const result = await teams.deleteOne(id);
      if (result?.notFound) return res.status(404).json({ success: false, error: 'Not found' });
      return res.status(200).json({ success: true });
    } catch (e) {
      console.error('[admin/teams/:id] delete error', e);
      return res.status(500).json({ success: false, error: e.message });
    }
  }

  return res.status(405).json({ success: false, error: 'Method not allowed' });
}


