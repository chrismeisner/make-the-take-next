// pages/api/sms/incoming.js
// Using native Node.js request stream to read raw body
import * as qs from 'querystring';
import { sendSMS } from '../../../lib/twilioService';
import { query } from '../../../lib/db/postgres';

// Helper to read raw request body without bodyParser
async function getRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

// Airtable removed; use Postgres sms_inbox table

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

  // Log incoming message to Postgres sms_inbox table
  try {
    await query(
      `INSERT INTO sms_inbox (message_sid, from_e164, to_e164, body, matched_keyword, webhook_status, received_at)
       VALUES ($1, $2, $3, $4, $5, 'received', NOW())`,
      [messageSID || null, from || null, toNumber || null, parsed.Body || '', body || null]
    );
    console.log(`[sms/incoming] Logged message ${messageSID} from ${from}`);
  } catch (err) {
    console.error('[sms/incoming] Error logging to sms_inbox', err);
  }
  
  // SMS conversation: handle active sms_take_sessions first
  try {
    const letter = (() => {
      const m = String(body || '').toUpperCase().match(/[AB]/);
      return m ? m[0] : null;
    })();
    // Find active session for this phone
    const { rows: sessRows } = await query(
      `SELECT s.id, s.profile_id, s.pack_id, s.current_prop_index, s.status, s.last_inbound_sid,
              p.pack_url, p.title
         FROM sms_take_sessions s
         JOIN packs p ON p.id = s.pack_id
        WHERE s.phone = $1 AND s.status = 'active'
        ORDER BY s.created_at DESC
        LIMIT 1`,
      [from]
    );
    if (sessRows && sessRows.length > 0) {
      const session = sessRows[0];
      // Idempotency: ignore duplicate inbound
      if (session.last_inbound_sid && session.last_inbound_sid === messageSID) {
        res.setHeader('Content-Type', 'text/xml');
        return res.status(200).send('<Response></Response>');
      }

      // Fetch ordered props for this pack
      const { rows: props } = await query(
        `SELECT id, prop_id, prop_short, prop_summary, prop_side_a_short, prop_side_b_short
           FROM props
          WHERE pack_id = $1
          ORDER BY COALESCE(prop_order, 0) ASC, created_at ASC`,
        [session.pack_id]
      );
      const total = props.length;

      // If no props, complete session
      if (!total) {
        await query(`UPDATE sms_take_sessions SET status = 'completed', last_inbound_sid = $2, updated_at = NOW() WHERE id = $1`, [session.id, messageSID]);
        res.setHeader('Content-Type', 'text/xml');
        return res.status(200).send('<Response></Response>');
      }

      const index = Math.max(0, Math.min(Number(session.current_prop_index || 0), total - 1));
      const prop = props[index];

      // If letter invalid, re-prompt current prop
      if (letter !== 'A' && letter !== 'B') {
        const a = (prop.prop_side_a_short || 'A').trim();
        const b = (prop.prop_side_b_short || 'B').trim();
        const line = (prop.prop_short || prop.prop_summary || '').trim();
        const msg = `${index + 1}/${total} ${line}\nReply A) ${a} or B) ${b}`;
        await sendSMS({ to: from, message: msg });
        res.setHeader('Content-Type', 'text/xml');
        return res.status(200).send('<Response></Response>');
      }

      // Record take: overwrite previous latest for this prop+phone, then insert
      try {
        await query(
          `UPDATE takes SET take_status = 'overwritten'
             WHERE prop_id_text = $1 AND take_mobile = $2 AND take_status = 'latest'`,
          [prop.prop_id, from]
        );
        await query(
          `INSERT INTO takes (prop_id, prop_id_text, prop_side, take_mobile, take_status, pack_id, profile_id, take_result, take_source)
           VALUES ($1, $2, $3, $4, 'latest', $5, $6, 'pending', 'sms')`,
          [prop.id, prop.prop_id, letter, from, session.pack_id, session.profile_id || null]
        );
      } catch (e) {
        console.error('[sms/incoming] Failed to record take', e?.message || e);
      }

      // Advance or complete
      const nextIndex = index + 1;
      if (nextIndex < total) {
        await query(`UPDATE sms_take_sessions SET current_prop_index = $2, last_inbound_sid = $3, updated_at = NOW() WHERE id = $1`, [session.id, nextIndex, messageSID]);
        const next = props[nextIndex];
        const a = (next.prop_side_a_short || 'A').trim();
        const b = (next.prop_side_b_short || 'B').trim();
        const line = (next.prop_short || next.prop_summary || '').trim();
        const msg = `${nextIndex + 1}/${total} ${line}\nReply A) ${a} or B) ${b}`;
        await sendSMS({ to: from, message: msg });
      } else {
        await query(`UPDATE sms_take_sessions SET status = 'completed', last_inbound_sid = $2, updated_at = NOW() WHERE id = $1`, [session.id, messageSID]);
        const site = (process.env.SITE_URL || 'https://makethetake.com').replace(/\/$/, '');
        const url = `${site}/packs/${session.pack_url || ''}`;
        await sendSMS({ to: from, message: `All set! Review your takes: ${url}` });
      }

      res.setHeader('Content-Type', 'text/xml');
      return res.status(200).send('<Response></Response>');
    }
  } catch (err) {
    console.error('[sms/incoming] session handling error', err);
  }

  // Check if the incoming message matches any groupKeyword in the Groups table
  // Group keyword flow removed from Airtable; no-op

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