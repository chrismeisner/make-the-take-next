import Airtable from 'airtable';
import { getToken } from 'next-auth/jwt';

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY })
  .base(process.env.AIRTABLE_BASE_ID);

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
    console.log(`[api/admin/events/[eventId]/props] Searching props for eventId=${eventId}`);
    // fetch all props and filter by Event link in code
    const allRecords = await base('Props')
      .select({ sort: [{ field: 'propOrder', direction: 'asc' }] })
      .all();
    console.log(`[api/admin/events/[eventId]/props] Retrieved ${allRecords.length} total Props records]`);
    const records = allRecords.filter((rec) =>
      Array.isArray(rec.fields.Event) && rec.fields.Event.includes(eventId)
    );
    console.log(`[api/admin/events/[eventId]/props] Filtered down to ${records.length} records matching eventId]`);
    const props = records.map((rec) => {
      const f = rec.fields;
      return {
        airtableId: rec.id,
        propShort: f.propShort || '',
        propSummary: f.propSummary || '',
        propStatus: f.propStatus || '',
        propOrder: f.propOrder || 0,
      };
    });
    return res.status(200).json({ success: true, props });
  } catch (err) {
    console.error('[api/admin/events/[eventId]/props] Airtable error =>', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch props' });
  }
}