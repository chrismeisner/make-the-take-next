import { Resend } from 'resend';

let cachedClient = null;

function getResendClient() {
  const apiKey = (process.env.RESEND_API_KEY || '').trim();
  if (!apiKey) return null;
  if (cachedClient) return cachedClient;
  cachedClient = new Resend(apiKey);
  return cachedClient;
}

/**
 * Send an email using Resend. Falls back to console log if not configured.
 *
 * @param {Object} params
 * @param {string|string[]} params.to - Recipient email(s)
 * @param {string} params.subject - Subject line
 * @param {string} [params.html] - HTML body
 * @param {string} [params.text] - Text body
 * @param {string} [params.from] - Optional override sender (defaults to EMAIL_FROM or onboarding@resend.dev)
 * @param {Object} [params.meta] - Optional metadata for logging/tracing (e.g., correlationId)
 * @returns {Promise<{success:boolean, id?:string, simulated?:boolean}>}
 */
export async function sendEmail({ to, subject, html, text, from, meta }) {
  const useFrom = (from || process.env.EMAIL_FROM || 'onboarding@resend.dev').trim();
  const recipients = Array.isArray(to) ? to.filter(Boolean) : [String(to || '').trim()];
  if (!recipients.length) throw new Error('sendEmail: missing recipient');
  if (!subject) throw new Error('sendEmail: missing subject');

  const client = getResendClient();
  if (!client) {
    try {
      console.warn('[emailService] RESEND_API_KEY not set; simulating email send');
      console.log('[emailService] Simulated email =>', { from: useFrom, to: recipients, subject, text: text || null, html: html ? `[${html.length} chars html]` : null, meta: meta || null });
    } catch {}
    return { success: true, simulated: true };
  }

  try {
    try { console.log('[emailService] send:attempt', { to: recipients, subject, meta: meta || null }); } catch {}
    const result = await client.emails.send({
      from: useFrom,
      to: recipients,
      subject: String(subject),
      ...(html ? { html: String(html) } : {}),
      ...(text ? { text: String(text) } : {}),
    });
    try { console.log('[emailService] send:success', { id: result?.id, meta: meta || null }); } catch {}
    return { success: true, id: result?.id };
  } catch (err) {
    try { console.error('[emailService] send:error', { message: err?.message || err, meta: meta || null }); } catch {}
    throw err;
  }
}


