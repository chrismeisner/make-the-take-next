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
    const rawPhone = String(body.phone || '').trim();
    let message = String(body.message || '').trim();
    const toAll = body.toAll === true;

    if (!rawPhone && !toAll) {
      return res.status(400).json({ success: false, error: 'phone required unless toAll is true' });
    }
    if (!message) message = 'Test message from Admin: SMS';

    // Read testers from content table
    const { rows } = await query(`SELECT body FROM content WHERE key = $1 LIMIT 1`, ['sms_testers']);
    const testers = Array.isArray(rows?.[0]?.body?.testers) ? rows[0].body.testers : [];

    const targets = toAll ? testers.map((t) => String(t.phone).trim()).filter(Boolean) : [rawPhone];
    if (!targets.length) return res.status(200).json({ success: true, sent: 0, info: 'No testers configured' });

    let sent = 0;
    const errors = [];
    for (const phone of targets) {
      try {
        await sendSMS({ to: phone, message });
        sent += 1;
      } catch (err) {
        errors.push({ phone, error: err?.message || String(err) });
      }
    }

    return res.status(200).json({ success: true, sent, errors });
  } catch (error) {
    console.error('[admin/sms/sendTest] error =>', error);
    return res.status(500).json({ success: false, error: 'Failed to send test' });
  }
}


