// pages/api/verifyCode.js
import twilio from "twilio";

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

export default async function handler(req, res) {
  if (req.method !== "POST") {
	return res.status(405).json({ error: "Method not allowed" });
  }
  const { phone, code } = req.body;
  if (!phone || !code) {
	return res.status(400).json({ error: "Missing phone or code" });
  }

  try {
	const numeric = phone.replace(/\D/g, "");
	const e164Phone = `+1${numeric}`;
	const check = await client.verify.v2
	  .services(process.env.TWILIO_VERIFY_SERVICE_SID)
	  .verificationChecks.create({ to: e164Phone, code });

	if (check.status === "approved") {
	  // Optionally create/find a user in DB, set session, etc.
	  return res.status(200).json({ success: true });
	} else {
	  return res.status(200).json({ success: false, error: "Invalid code" });
	}
  } catch (err) {
	console.error("[verifyCode] Error:", err);
	return res.status(500).json({ error: "Failed to verify code" });
  }
}
