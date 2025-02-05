// pages/api/sendCode.js
import twilio from "twilio";

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

export default async function handler(req, res) {
  if (req.method !== "POST") {
	return res.status(405).json({ error: "Method not allowed" });
  }

  const { phone } = req.body;
  if (!phone) {
	return res.status(400).json({ error: "Missing phone number" });
  }

  try {
	// Format to E.164 (assuming US, so +1)
	const numeric = phone.replace(/\D/g, "");
	const e164Phone = `+1${numeric}`;

	// Send the code via Twilio Verify
	const verification = await client.verify.v2
	  .services(process.env.TWILIO_VERIFY_SERVICE_SID)
	  .verifications.create({ to: e164Phone, channel: "sms" });

	// Optionally check verification status
	if (verification.status === "pending") {
	  return res.status(200).json({ success: true });
	} else {
	  // Something unexpected
	  return res
		.status(500)
		.json({ error: `Unexpected verification status: ${verification.status}` });
	}
  } catch (error) {
	console.error("[sendCode] Twilio error:", error);
	return res.status(500).json({ error: "Failed to send verification code" });
  }
}
