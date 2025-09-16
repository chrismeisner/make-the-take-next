import { getToken } from 'next-auth/jwt';
import { sendSMS } from '../../../../../lib/twilioService';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  const { packId } = req.query;
  if (!packId) {
    return res.status(400).json({ success: false, error: 'Missing packId' });
  }
  let messages = [];
  let dryRun = false;
  try {
    const body = req.body && typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    messages = Array.isArray(body?.messages) ? body.messages : [];
    dryRun = Boolean(body?.dryRun);
  } catch {
    return res.status(400).json({ success: false, error: 'Invalid JSON body' });
  }
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ success: false, error: 'No messages provided' });
  }

  // Basic validation + dedupe by phone
  const normalizePhone = (p) => (typeof p === 'string' ? p.trim() : '');
  const valid = [];
  const seen = new Set();
  for (const m of messages) {
    const to = normalizePhone(m?.to);
    const body = (m?.body || '').toString();
    if (!to || !body) continue;
    // Very light validation: allow + and digits, length >= 8
    if (!/^\+?\d{8,}$/.test(to)) continue;
    if (seen.has(to)) continue;
    seen.add(to);
    valid.push({ to, body });
  }
  if (valid.length === 0) {
    return res.status(400).json({ success: false, error: 'No valid messages to send' });
  }

  const hasFrom = Boolean((process.env.TWILIO_FROM_NUMBER || '').trim());
  const hasServiceSid = Boolean((process.env.TWILIO_MESSAGING_SERVICE_SID || '').trim());
  if (dryRun) {
    const segments = valid.reduce((s, v) => s + Math.max(1, Math.ceil((v.body || '').length / 160)), 0);
    return res.status(200).json({ success: true, sent: 0, failed: 0, total: valid.length, segments, dryRun: true, sender: { hasFrom, hasServiceSid } });
  }

  let sent = 0;
  let failed = 0;
  const errors = [];
  try {
    console.log('[admin/send-results-sms] Using sender', { hasFrom, hasServiceSid });
  } catch {}
  for (const m of valid) {
    try {
      await sendSMS({ to: m.to, message: m.body });
      sent += 1;
    } catch (e) {
      failed += 1;
      try { errors.push({ to: m.to, error: e?.message || String(e) }); } catch {}
    }
  }
  return res.status(200).json({ success: true, total: valid.length, sent, failed, errors, sender: { hasFrom, hasServiceSid } });
}


