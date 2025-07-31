import { createEvent } from '../../../lib/airtableService';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
  const { eventTitle, eventTime, eventLeague } = req.body;
  if (!eventTitle || !eventTime || !eventLeague) {
    return res.status(400).json({ success: false, error: 'Missing required fields' });
  }
  try {
    const record = await createEvent({ eventTitle, eventTime, eventLeague });
    return res.status(200).json({ success: true, record });
  } catch (error) {
    console.error('[api/admin/createEvent] Airtable create error =>', error);
    return res.status(500).json({ success: false, error: 'Failed to create event' });
  }
} 