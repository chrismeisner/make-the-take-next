// File: lib/twilioService.js
import twilio from "twilio";

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

/**
 * Sends an SMS message using Twilio.
 *
 * @param {Object} params
 * @param {string} params.to - Recipient phone number in E.164 format.
 * @param {string} params.message - The message text to send.
 * @returns {Promise<Object>} - Resolves with the Twilio message object.
 */
export async function sendSMS({ to, message }) {
  console.log(
	"[twilioService] Sending SMS - From:",
	process.env.TWILIO_FROM_NUMBER,
	"To:",
	to,
	"Message:",
	message
  );
  try {
	const msg = await client.messages.create({
	  body: message,
	  to, // recipient's number
	  from: process.env.TWILIO_FROM_NUMBER, // using the correct env variable
	});
	return msg;
  } catch (error) {
	console.error("[twilioService] Error sending SMS to", to, error);
	throw error;
  }
}
