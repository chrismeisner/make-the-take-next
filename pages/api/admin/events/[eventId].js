import { getEventById } from '../../../../lib/airtableService';
import { getToken } from 'next-auth/jwt';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  const { eventId } = req.query;
  if (!eventId) {
    return res.status(400).json({ success: false, error: 'Missing eventId parameter' });
  }
  try {
    const event = await getEventById(eventId);
    return res.status(200).json({ success: true, event });
  } catch (err) {
    console.error('[api/admin/events/[eventId]] Airtable fetch error =>', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch event' });
  }
}