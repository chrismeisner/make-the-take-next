// File: pages/api/outbox/sendOne.js
import { sendSMS } from "../../../lib/twilioService";
import { updateOutboxStatus } from "../../../lib/airtableService";
import Airtable from "airtable";

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY })
  .base(process.env.AIRTABLE_BASE_ID);

/**
 * Helper: Given a linked value from outboxRecipients,
 * return a valid phone number.
 *
 * If the value already matches a phone pattern, return it.
 * Otherwise, treat it as a record ID and look up the Profile record,
 * then return its profileMobile value.
 */
async function getPhoneNumber(linkedValue) {
  // If linkedValue is a string that starts with '+' and has at least 10 digits, assume it's a phone number.
  if (typeof linkedValue === "string" && /^\+\d{10,15}$/.test(linkedValue)) {
	return linkedValue;
  }
  // Otherwise, treat it as a record ID and fetch the Profile.
  try {
	const profile = await base("Profiles").find(linkedValue);
	const phone = profile.fields.profileMobile;
	console.log("[sendOne] Fetched phone", phone, "for profile", linkedValue);
	return phone;
  } catch (error) {
	console.error("[sendOne] Error fetching profile for recipient", linkedValue, error);
	return null;
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
	return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  const { recordId } = req.body;
  if (!recordId) {
	return res.status(400).json({ success: false, error: "Missing recordId" });
  }

  try {
	// Retrieve the specific Outbox record.
	const record = await base("Outbox").find(recordId);
	if (!record) {
	  return res.status(404).json({ success: false, error: "Record not found" });
	}
	const { outboxMessage, outboxRecipients, outboxStatus } = record.fields;
	if (outboxStatus !== "ready") {
	  return res.status(400).json({ success: false, error: "Record is not ready to send" });
	}

	// outboxRecipients may be an array of record IDs or already-expanded phone numbers.
	const rawRecipients = Array.isArray(outboxRecipients) ? outboxRecipients : [];
	let recipients = [];
	for (const rec of rawRecipients) {
	  const phone = await getPhoneNumber(rec);
	  if (phone) {
		recipients.push(phone);
	  }
	}

	if (recipients.length === 0) {
	  await updateOutboxStatus(recordId, "error");
	  return res.status(400).json({ success: false, error: "No valid recipient phone numbers found" });
	}

	let allSent = true;
	for (const phone of recipients) {
	  try {
		await sendSMS({ to: phone, message: outboxMessage });
	  } catch (err) {
		allSent = false;
		console.error(
		  `[Outbox] Error sending SMS to ${phone} for record ${recordId}:`,
		  err
		);
	  }
	}
	if (allSent) {
	  await updateOutboxStatus(recordId, "sent");
	} else {
	  await updateOutboxStatus(recordId, "error");
	}
	return res.status(200).json({ success: true });
  } catch (err) {
	console.error("[sendOne] Error:", err);
	return res.status(500).json({ success: false, error: err.message });
  }
}
