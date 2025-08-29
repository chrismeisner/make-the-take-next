import { getEventById } from '../../../../lib/airtableService';
import { getToken } from 'next-auth/jwt';
import Airtable from 'airtable';

export default async function handler(req, res) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  const { eventId } = req.query;
  if (!eventId) {
    return res.status(400).json({ success: false, error: 'Missing eventId parameter' });
  }

  if (req.method === 'GET') {
    try {
      const event = await getEventById(eventId);
      return res.status(200).json({ success: true, event });
    } catch (err) {
      console.error('[api/admin/events/[eventId]] Airtable fetch error =>', err);
      return res.status(500).json({ success: false, error: 'Failed to fetch event' });
    }
  }

  if (req.method === 'PATCH') {
    try {
      const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);
      const { tankGameID } = req.body || {};
      const fields = {};
      if (tankGameID !== undefined) fields.tankGameID = tankGameID || '';
      const updated = await base('Events').update([{ id: eventId, fields }], { typecast: true });
      const event = await getEventById(eventId);
      return res.status(200).json({ success: true, event, record: updated[0] });
    } catch (err) {
      console.error('[api/admin/events/[eventId] PATCH] Error =>', err);
      return res.status(500).json({ success: false, error: 'Failed to update event' });
    }
  }

  return res.status(405).json({ success: false, error: 'Method not allowed' });
}