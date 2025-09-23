import { getToken } from 'next-auth/jwt';
import { getDataBackend } from '../../../../lib/runtimeConfig';
import { sendEmail } from '../../../../lib/emailService';

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
    const to = String(body.to || '').trim();
    const subject = String(body.subject || 'Test Email');
    const text = String(body.text || 'This is a test email from Admin Email Tester.');
    const html = body.html ? String(body.html) : null;

    if (!to) {
      return res.status(400).json({ success: false, error: 'to is required' });
    }

    const result = await sendEmail({ to, subject, text, ...(html ? { html } : {}) });
    return res.status(200).json({ success: true, id: result?.id || null, simulated: !!result?.simulated });
  } catch (error) {
    try { console.error('[admin/email/test] error =>', error?.message || error); } catch {}
    return res.status(500).json({ success: false, error: 'Failed to send test email' });
  }
}


