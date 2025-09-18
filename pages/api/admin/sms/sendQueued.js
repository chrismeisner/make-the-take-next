// File: pages/api/admin/sms/sendQueued.js

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
    // Find ready outbox messages
    const { rows: outboxRows } = await query(
      `SELECT id, message FROM outbox WHERE status = 'ready' ORDER BY created_at ASC LIMIT 10`
    );
    if (!outboxRows.length) {
      return res.status(200).json({ success: true, processed: 0 });
    }

    let totalRecipients = 0;
    let totalSent = 0;
    for (const ob of outboxRows) {
      const { rows: recRows } = await query(
        `SELECT p.mobile_e164 AS phone
           FROM outbox_recipients r
           JOIN profiles p ON p.id = r.profile_id
          WHERE r.outbox_id = $1
            AND COALESCE(p.sms_opt_out_all, FALSE) = FALSE
            AND p.mobile_e164 IS NOT NULL`,
        [ob.id]
      );
      totalRecipients += recRows.length;
      let allSent = true;
      for (const r of recRows) {
        try {
          await sendSMS({ to: r.phone, message: ob.message });
          totalSent += 1;
        } catch (err) {
          allSent = false;
          try { console.error('[admin/sms/sendQueued] send error =>', err?.message || err); } catch {}
        }
      }
      await query(`UPDATE outbox SET status = $2 WHERE id = $1`, [ob.id, allSent ? 'sent' : 'error']);
    }

    return res.status(200).json({ success: true, processed: outboxRows.length, recipients: totalRecipients, sent: totalSent });
  } catch (error) {
    console.error('[admin/sms/sendQueued] error =>', error);
    return res.status(500).json({ success: false, error: 'Failed to send queued messages' });
  }
}


