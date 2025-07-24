// File: pages/api/challenges/index.js
import { upsertChallenge, getChallengesByPack } from '../../../lib/airtableService';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const { packURL } = req.query;
    if (!packURL) {
      return res.status(400).json({ success: false, error: 'Missing packURL query parameter' });
    }
    try {
      const recs = await getChallengesByPack({ packURL });
      const challenges = recs.map((rec) => ({
        id: rec.id,
        initiatorReceiptId: rec.fields.initiatorReceiptID,
        challengerReceiptId: rec.fields.challengerReceiptID || null,
        initiatorProfile: rec.fields.initiatorProfile || [],
        challengerProfile: rec.fields.challengerProfile || [],
      }));
      return res.status(200).json({ success: true, challenges });
    } catch (err) {
      console.error('[challenges][GET] Error:', err);
      return res.status(500).json({ success: false, error: err.message });
    }
  } else if (req.method === 'POST') {
    const { packURL, initiatorReceiptId, challengerReceiptId } = req.body;
    if (!packURL || !initiatorReceiptId) {
      return res.status(400).json({ success: false, error: 'Missing required fields: packURL or initiatorReceiptId' });
    }
    try {
      const rec = await upsertChallenge({ packURL, initiatorReceiptID: initiatorReceiptId, challengerReceiptID: challengerReceiptId });
      return res.status(200).json({
        success: true,
        challenge: {
          id: rec.id,
          initiatorReceiptId: rec.fields.initiatorReceiptID,
          challengerReceiptId: rec.fields.challengerReceiptID || null,
          initiatorProfile: rec.fields.initiatorProfile || [],
          challengerProfile: rec.fields.challengerProfile || [],
        },
      });
    } catch (err) {
      console.error('[challenges][POST] Error:', err);
      return res.status(500).json({ success: false, error: err.message });
    }
  } else {
    res.setHeader('Allow', ['GET', 'POST']);
    return res.status(405).json({ success: false, error: `Method ${req.method} not allowed` });
  }
} 