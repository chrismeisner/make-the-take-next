// File: pages/api/outbox/sendOne.js
import { sendSMS } from "../../../lib/twilioService";
import { query } from "../../../lib/db/postgres";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  const { outboxId } = req.body || {};
  if (!outboxId) {
    return res.status(400).json({ success: false, error: "Missing outboxId" });
  }

  try {
    // 1) Load the outbox row
    const { rows: outboxRows } = await query(
      `SELECT id, message, status
         FROM outbox
        WHERE id::text = $1
        LIMIT 1`,
      [outboxId]
    );
    const outbox = outboxRows[0];
    if (!outbox) {
      return res.status(404).json({ success: false, error: "Outbox record not found" });
    }
    if (outbox.status !== 'ready') {
      return res.status(400).json({ success: false, error: "Outbox record is not ready to send" });
    }

    // 2) Load recipients' phone numbers
    const { rows: recipientRows } = await query(
      `SELECT p.mobile_e164 AS phone
         FROM outbox_recipients r
         JOIN profiles p ON p.id = r.profile_id
        WHERE r.outbox_id = $1 AND p.mobile_e164 IS NOT NULL`,
      [outbox.id]
    );
    const recipients = recipientRows.map(r => r.phone).filter(Boolean);
    if (recipients.length === 0) {
      await query(`UPDATE outbox SET status = 'error' WHERE id = $1`, [outbox.id]);
      return res.status(400).json({ success: false, error: "No valid recipient phone numbers found" });
    }

    // 3) Send SMS to each recipient
    let allSent = true;
    for (const phone of recipients) {
      try {
        await sendSMS({ to: phone, message: outbox.message || '' });
      } catch (err) {
        allSent = false;
        // eslint-disable-next-line no-console
        console.error(`[Outbox] Error sending SMS to ${phone} for outbox ${outbox.id}:`, err);
      }
    }

    // 4) Update status based on outcome
    const newStatus = allSent ? 'sent' : 'error';
    await query(`UPDATE outbox SET status = $2 WHERE id = $1`, [outbox.id, newStatus]);

    return res.status(200).json({ success: true, status: newStatus });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[sendOne] Error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
