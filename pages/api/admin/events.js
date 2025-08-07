import { getAllEvents } from '../../../lib/airtableService';
import { getToken } from 'next-auth/jwt';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  try {
    const events = await getAllEvents();
    return res.status(200).json({ success: true, events });
  } catch (err) {
    console.error('[api/admin/events] Airtable fetch error =>', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch events' });
  }
}