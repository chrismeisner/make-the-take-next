// File: lib/twilioService.js
import twilio from "twilio";

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);
// Note: read env at call-time to avoid stale values during dev hot-reload

/**
 * Sends an SMS message using Twilio.
 *
 * @param {Object} params
 * @param {string} params.to - Recipient phone number in E.164 format.
 * @param {string} params.message - The message text to send.
 * @returns {Promise<Object>} - Resolves with the Twilio message object.
 */
export async function sendSMS({ to, message }) {
  const useFrom = (process.env.TWILIO_FROM_NUMBER || '').trim();
  const useService = (process.env.TWILIO_MESSAGING_SERVICE_SID || '').trim();
  if (!useFrom && !useService) {
    const err = new Error("Twilio sender not configured. Set TWILIO_FROM_NUMBER or TWILIO_MESSAGING_SERVICE_SID.");
    console.error("[twilioService]", err.message);
    throw err;
  }
  try {
    const params = { body: String(message || ''), to: String(to || '').trim() };
    if (useService) params.messagingServiceSid = useService; else params.from = useFrom;
    console.log("[twilioService] Sending SMS", { to: params.to, using: useService ? 'messagingServiceSid' : 'from' });
    const msg = await client.messages.create(params);
    return msg;
  } catch (error) {
    console.error("[twilioService] Error sending SMS to", to, error?.message || error);
    throw error;
  }
}
