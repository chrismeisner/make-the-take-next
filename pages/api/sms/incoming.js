// pages/api/sms/incoming.js
// Using native Node.js request stream to read raw body
import * as qs from 'querystring';
import { sendSMS } from '../../../lib/twilioService';
import Airtable from 'airtable';

// Helper to read raw request body without bodyParser
async function getRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY })
  .base(process.env.AIRTABLE_BASE_ID);

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end('Method Not Allowed');
  }

  // Parse the raw form-encoded payload from Twilio
  const rawBuffer = await getRawBody(req);
  const rawBody = rawBuffer.toString();
  const parsed = qs.parse(rawBody);
  const from = parsed.From;
  const toNumber = parsed.To;
  const messageSID = parsed.MessageSid;
  const body = parsed.Body ? parsed.Body.trim().toUpperCase() : '';

  // Log incoming message to Inbox table
  try {
    await base('Inbox').create([{ fields: {
      messageSID,
      inboxFrom: from,
      inboxTo: toNumber,
      inboxBody: parsed.Body || '',
      inboxReceivedAt: new Date().toISOString(),
      inboxMatchedKeyword: body,
      inboxWebhookStatus: 'received',
    } }]);
    console.log(`[sms/incoming] Logged message ${messageSID} from ${from}`);
  } catch (err) {
    console.error('[sms/incoming] Error logging to Inbox', err);
  }
  
  // Check if the incoming message matches any groupKeyword in the Groups table
  try {
    const groupFound = await base('Groups')
      .select({
        filterByFormula: `UPPER({groupKeyword}) = "${body}"`,
        maxRecords: 1,
      })
      .firstPage();
    if (groupFound.length > 0) {
      const groupRec = groupFound[0];
      console.log(
        `[sms/incoming] Matched group keyword '${groupRec.fields.groupKeyword}' for message ${messageSID}`
      );
      // Link this user to the group by adding their profile record to groupMembers
      const phone = from;
      let profileRecId;
      // Find or create profile record
      const profResults = await base('Profiles')
        .select({ filterByFormula: `{profileMobile} = "${phone}"`, maxRecords: 1 })
        .firstPage();
      if (profResults.length > 0) {
        profileRecId = profResults[0].id;
      } else {
        const created = await base('Profiles').create([
          { fields: { profileMobile: phone } }
        ]);
        profileRecId = created[0].id;
      }
      // Update groupMembers if not already linked
      const existingMembers = groupRec.fields.groupMembers || [];
      if (!existingMembers.includes(profileRecId)) {
        const updatedMembers = [...existingMembers, profileRecId];
        await base('Groups').update([
          {
            id: groupRec.id,
            fields: { groupMembers: updatedMembers }
          }
        ]);
        console.log(
          `[sms/incoming] Added profile ${profileRecId} to group ${groupRec.id}`
        );
      }
      // Send acknowledgment SMS for group match
      await sendSMS({
        to: from,
        message: `you matched with ${groupRec.fields.groupKeyword}`,
      });
      // Respond with empty TwiML to acknowledge receipt
      res.setHeader('Content-Type', 'text/xml');
      return res.status(200).send('<Response></Response>');
    }
  } catch (err) {
    console.error('[sms/incoming] Error matching group keyword', err);
  }

  if (body === 'TAKERS') {
    try {
      // Upsert subscriber as a Profiles record by phone number
      const phone = from;
      const existing = await base('Profiles')
        .select({ filterByFormula: `{profileMobile} = "${phone}"`, maxRecords: 1 })
        .firstPage();

      if (existing.length === 0) {
        await base('Profiles').create([{ fields: { profileMobile: phone } }]);
      }

      // Send onboarding SMS
      await sendSMS({
        to: phone,
        message: '🎉 Thanks for signing up for TAKERS! Reply STOP to unsubscribe.',
      });

      // Respond with empty TwiML to acknowledge receipt
      res.setHeader('Content-Type', 'text/xml');
      return res.status(200).send('<Response></Response>');
    } catch (error) {
      console.error('[sms/incoming] Error handling incoming SMS', error);
      res.setHeader('Content-Type', 'text/xml');
      return res
        .status(500)
        .send('<Response><Message>Sorry, something went wrong. Please try again later.</Message></Response>');
    }
  }

  // For any other incoming text, just reply with empty response
  res.setHeader('Content-Type', 'text/xml');
  return res.status(200).send('<Response></Response>');
}