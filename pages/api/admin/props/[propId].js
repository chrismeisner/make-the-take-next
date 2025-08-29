import { getToken } from 'next-auth/jwt';
import Airtable from 'airtable';

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
  const { propId } = req.query;
  if (!propId) {
    return res.status(400).json({ success: false, error: 'Missing propId' });
  }
  try {
    const rec = await base('Props').find(propId);
    const f = rec.fields || {};
    let event = null;
    const links = Array.isArray(f.Event) ? f.Event : [];
    if (links.length) {
      try {
        const ev = await base('Events').find(links[0]);
        event = {
          airtableId: ev.id,
          eventTitle: ev.fields.eventTitle || '',
          eventTime: ev.fields.eventTime || null,
          eventLeague: ev.fields.eventLeague || '',
          homeTeamAbbreviation: ev.fields.homeTeamAbbreviation || '',
          awayTeamAbbreviation: ev.fields.awayTeamAbbreviation || '',
          tankGameID: ev.fields.tankGameID || '',
          espnGameID: ev.fields.espnGameID || '',
        };
      } catch {}
    }
    const prop = {
      airtableId: rec.id,
      propID: f.propID || rec.id,
      propShort: f.propShort || '',
      propSummary: f.propSummary || '',
      gradingMode: f.gradingMode ? String(f.gradingMode).toLowerCase() : 'manual',
      formulaKey: f.formulaKey || '',
      formulaParams: (typeof f.formulaParams === 'string') ? f.formulaParams : (f.formulaParams ? JSON.stringify(f.formulaParams) : ''),
      PropSideAShort: f.PropSideAShort || '',
      PropSideATake: f.PropSideATake || '',
      PropSideAMoneyline: f.PropSideAMoneyline ?? null,
      PropSideBShort: f.PropSideBShort || '',
      PropSideBTake: f.PropSideBTake || '',
      PropSideBMoneyline: f.PropSideBMoneyline ?? null,
      propType: f.propType || 'moneyline',
      propStatus: f.propStatus || 'open',
      propValueModel: f.propValueModel || 'vegas',
      teams: Array.isArray(f.Teams) ? f.Teams : [],
      propOpenTime: f.propOpenTime || null,
      propCloseTime: f.propCloseTime || null,
      propCoverSource: f.propCoverSource || 'event',
      propESPNLookup: f.propESPNLookup || '',
      propLeagueLookup: f.propLeagueLookup || '',
      event,
    };
    return res.status(200).json({ success: true, prop });
  } catch (err) {
    console.error('[api/admin/props/[propId]] error =>', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch prop' });
  }
}


