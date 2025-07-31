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
      const challengeUrl = `${process.env.SITE_URL}/challenges/${rec.id}`;

      // Fetch profile records for personalization
      let initiatorProfileRec = null;
      let challengerProfileRec = null;
      if (initiatorProfiles[0]) {
        try {
          initiatorProfileRec = await profileBase('Profiles').find(initiatorProfiles[0]);
        } catch (err) {
          console.error('[challenges][POST] Error fetching initiator profile:', err);
        }
      }
      if (challengerProfiles[0]) {
        try {
          challengerProfileRec = await profileBase('Profiles').find(challengerProfiles[0]);
        } catch (err) {
          console.error('[challenges][POST] Error fetching challenger profile:', err);
        }
      }

      // Notify initiator
      if (initiatorProfileRec) {
        const phone = initiatorProfileRec.fields.profileMobile;
        const challengerName = challengerProfileRec?.fields.profileID || '';
        if (phone) {
          const message = `${challengerName} has accepted your challenge! Check out their takes here: ${challengeUrl}`;
          console.log(`[challenges][POST] Sending SMS to initiator ${phone}: ${message}`);
          await sendSMS({ to: phone, message });
        } else {
          console.warn(`[challenges][POST] No phone for initiator profile ${initiatorProfiles[0]}`);
        }
      }

      // Notify challenger
      if (challengerProfileRec) {
        const phone = challengerProfileRec.fields.profileMobile;
        const initiatorName = initiatorProfileRec?.fields.profileID || '';
        if (phone) {
          const message = `You've accepted ${initiatorName}'s challenge! Track how your takes match up vs theirs: ${challengeUrl}`;
          console.log(`[challenges][POST] Sending SMS to challenger ${phone}: ${message}`);
          await sendSMS({ to: phone, message });
        } else {
          console.warn(`[challenges][POST] No phone for challenger profile ${challengerProfiles[0]}`);
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