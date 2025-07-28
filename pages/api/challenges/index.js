// File: pages/api/challenges/index.js
import { upsertChallenge, getChallengesByPack } from '../../../lib/airtableService';
import Airtable from 'airtable';
import { sendSMS } from '../../../lib/twilioService';
// Airtable client for querying Profiles
const profileBase = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);

export default async function handler(req, res) {
  if (req.method === 'GET') {
    // 🚀 Received raw Challengers tab request
    const { packURL } = req.query;
    console.log(`🚀 [challenges][GET] Raw fetch for packURL=${packURL}`);
    if (!packURL) {
      return res.status(400).json({ success: false, error: 'Missing packURL query parameter' });
    }
    try {
      // fetch all challenges for this pack
      const recs = await getChallengesByPack({ packURL });
      console.log(`📊 [challenges][GET] Retrieved ${recs.length} challenge records for packURL=${packURL}`);
      // return raw fields for inspection
      const challenges = recs.map(rec => ({ id: rec.id, fields: rec.fields }));
      return res.status(200).json({ success: true, challenges });
    } catch (err) {
      console.error('[challenges][GET] Error:', err);
      return res.status(500).json({ success: false, error: err.message });
    }
  } else if (req.method === 'POST') {
    console.log('[challenges][POST] Request body:', req.body);
    const { packURL, initiatorReceiptId, challengerReceiptId } = req.body;
    if (!packURL || !initiatorReceiptId) {
      return res.status(400).json({ success: false, error: 'Missing required fields: packURL or initiatorReceiptId' });
    }
    try {
      console.log('[challenges][POST] Calling upsertChallenge with:', { packURL, initiatorReceiptId, challengerReceiptId });
      const rec = await upsertChallenge({ packURL, initiatorReceiptID: initiatorReceiptId, challengerReceiptID: challengerReceiptId });
      console.log('[challenges][POST] upsertChallenge result:', { id: rec.id, fields: rec.fields });
      // --- SMS notifications: initiator and challenger ---
      const initiatorProfiles = rec.fields.initiatorProfile || [];
      const challengerProfiles = rec.fields.challengerProfile || [];
      const recipientIds = [...new Set([...initiatorProfiles, ...challengerProfiles])];
      console.log('[challenges][POST] SMS recipients (profile IDs):', recipientIds);
      for (const profileId of recipientIds) {
        try {
          const profileRec = await profileBase('Profiles').find(profileId);
          const phone = profileRec.fields.profileMobile;
          if (phone) {
            const challengeUrl = `${process.env.SITE_URL}/challenges/${rec.id}`;
            console.log(`[challenges][POST] Sending SMS to ${phone}: ${challengeUrl}`);
            await sendSMS({ to: phone, message: `📣 You've been challenged! View it here: ${challengeUrl}` });
          } else {
            console.warn(`[challenges][POST] No phone for profile ${profileId}`);
          }
        } catch (smsErr) {
          console.error(`[challenges][POST] SMS error for profile ${profileId}:`, smsErr);
        }
      }
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