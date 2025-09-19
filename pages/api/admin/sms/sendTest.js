// File: pages/api/admin/sms/sendTest.js

import { getToken } from 'next-auth/jwt';
import { query } from '../../../../lib/db/postgres';
import { getDataBackend } from '../../../../lib/runtimeConfig';
import { sendSMS } from '../../../../lib/twilioService';

export default async function handler(req, res) {
  const backend = getDataBackend();
  if (backend !== 'postgres') {
    return res.status(400).json({ success: false, error: 'Postgres backend required' });
  }

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token || !token.superAdmin) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const message = String(body.message || '').trim();
    let profileId = body.profileId || null;
    const phoneFromBody = body.phone ? String(body.phone).trim() : null;
    const toAll = body.toAll === true;

    if (!message && !toAll) {
      return res.status(400).json({ success: false, error: 'message is required' });
    }

    // Support testers flow: send to all configured tester phones directly (no outbox)
    if (toAll) {
      const msg = message || 'Test message from Admin: SMS';
      const { rows } = await query(`SELECT body FROM content WHERE key = $1 LIMIT 1`, ['sms_testers']);
      const testers = Array.isArray(rows?.[0]?.body?.testers) ? rows[0].body.testers : [];
      const targets = testers.map((t) => String(t.phone).trim()).filter(Boolean);
      if (!targets.length) return res.status(200).json({ success: true, sent: 0, info: 'No testers configured' });
      let sent = 0;
      const errors = [];
      for (const phone of targets) {
        try {
          await sendSMS({ to: phone, message: msg });
          sent += 1;
        } catch (err) {
          errors.push({ phone, error: err?.message || String(err) });
        }
      }
      return res.status(200).json({ success: true, sent, errors });
    }

    // Resolve profile by phone if profileId not provided
    if (!profileId && phoneFromBody) {
      const { rows: pr } = await query(
        `SELECT id FROM profiles WHERE mobile_e164 = $1 LIMIT 1`,
        [phoneFromBody]
      );
      if (pr.length) {
        profileId = pr[0].id;
      }
    }

    if (!profileId) {
      return res.status(400).json({ success: false, error: 'profileId (or known phone) is required' });
    }

    // Create outbox record (ready) with initial log entry
    const initLog = [{ at: new Date().toISOString(), level: 'info', message: 'created', details: { route: 'admin/sms/sendTest' } }];
    const { rows: obRows } = await query(
      `INSERT INTO outbox (message, status, logs) VALUES ($1, 'ready', $2::jsonb) RETURNING id`,
      [message, JSON.stringify(initLog)]
    );
    const outboxId = obRows[0].id;

    // Attach recipient
    await query(
      `INSERT INTO outbox_recipients (outbox_id, profile_id) VALUES ($1, $2)`,
      [outboxId, profileId]
    );

    // Fetch phone for the profile
    const { rows: phoneRows } = await query(
      `SELECT mobile_e164 AS phone, COALESCE(sms_opt_out_all, FALSE) AS opted_out FROM profiles WHERE id = $1 LIMIT 1`,
      [profileId]
    );
    if (!phoneRows.length || !phoneRows[0].phone) {
      await query(`UPDATE outbox SET status = 'error', logs = COALESCE(logs, '[]'::jsonb) || $2::jsonb WHERE id = $1`, [outboxId, JSON.stringify([{ at: new Date().toISOString(), level: 'error', message: 'no phone on file' }])]);
      return res.status(400).json({ success: false, error: 'Recipient has no phone on file', outboxId });
    }
    if (phoneRows[0].opted_out) {
      await query(`UPDATE outbox SET status = 'error', logs = COALESCE(logs, '[]'::jsonb) || $2::jsonb WHERE id = $1`, [outboxId, JSON.stringify([{ at: new Date().toISOString(), level: 'error', message: 'recipient opted out' }])]);
      return res.status(400).json({ success: false, error: 'Recipient opted out of SMS', outboxId });
    }

    // Send via Twilio and update status to sent/error
    let sent = false;
    try {
      await sendSMS({ to: phoneRows[0].phone, message });
      sent = true;
      await query(`UPDATE outbox SET status = 'sent', logs = COALESCE(logs, '[]'::jsonb) || $2::jsonb WHERE id = $1`, [outboxId, JSON.stringify([{ at: new Date().toISOString(), level: 'info', message: 'twilio sent', details: { to: phoneRows[0].phone } }])]);
    } catch (err) {
      try { console.error('[admin/sms/sendTest] send error =>', err?.message || err); } catch {}
      await query(`UPDATE outbox SET status = 'error', logs = COALESCE(logs, '[]'::jsonb) || $2::jsonb WHERE id = $1`, [outboxId, JSON.stringify([{ at: new Date().toISOString(), level: 'error', message: 'twilio error', details: { error: String(err?.message || err) } }])]);
    }

    return res.status(200).json({ success: true, outboxId, sent });
  } catch (error) {
    console.error('[admin/sms/sendTest] error =>', error);
    return res.status(500).json({ success: false, error: 'Failed to send test SMS' });
  }
}
