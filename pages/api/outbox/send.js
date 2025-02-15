// File: /pages/api/outbox/send.js
import { fetchReadyOutboxMessages, updateOutboxStatus } from "../../../lib/airtableService";
import { sendSMS } from "../../../lib/twilioService";

export default async function handler(req, res) {
  if (req.method !== "POST") {
	return res.status(405).json({ success: false, error: "Method not allowed" });
  }
  try {
	// Fetch outbox records with status "ready"
	const records = await fetchReadyOutboxMessages();
	
	// Process each record one-by-one (you may choose to process in parallel if desired)
	for (const record of records) {
	  const { outboxMessage, outboxRecipients } = record.fields;
	  
	  // outboxRecipients should be an array of expanded values (profileMobile numbers)
	  // Depending on your Airtable setup, it might be an array of strings (phone numbers) or objects.
	  // Here we assume that the lookup has been expanded so you directly get phone numbers.
	  const recipients = Array.isArray(outboxRecipients) ? outboxRecipients : [];
	  
	  if (recipients.length === 0) {
		console.error(`[Outbox] No recipients found for record ${record.id}`);
		await updateOutboxStatus(record.id, "error");
		continue;
	  }
	  
	  // Send SMS to all recipients; track if all send successfully.
	  let allSent = true;
	  for (const phone of recipients) {
		try {
		  await sendSMS({ to: phone, message: outboxMessage });
		} catch (err) {
		  allSent = false;
		  console.error(`[Outbox] Error sending SMS to ${phone} for record ${record.id}:`, err);
		}
	  }
	  
	  // Update status based on outcome
	  if (allSent) {
		await updateOutboxStatus(record.id, "sent");
	  } else {
		await updateOutboxStatus(record.id, "error");
	  }
	}
	
	return res.status(200).json({ success: true, processed: records.length });
  } catch (err) {
	console.error("[Outbox API] Error processing outbox messages:", err);
	return res.status(500).json({ success: false, error: err.message });
  }
}
