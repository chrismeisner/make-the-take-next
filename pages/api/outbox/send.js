// File: /pages/api/outbox/send.js
import { sendSMS } from "../../../lib/twilioService";
import { query } from "../../../lib/db/postgres";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }
  try {
    // 1) Fetch all outbox messages that are ready to send
    const { rows: outboxRows } = await query(
      `SELECT id, message
         FROM outbox
        WHERE status = 'ready'
        ORDER BY created_at ASC`
    );

    let processed = 0;

    // 2) For each outbox row, fetch recipients' phone numbers and send
    for (const row of outboxRows) {
      const outboxId = row.id;
      const message = row.message || '';

      const { rows: recipientRows } = await query(
        `SELECT p.mobile_e164 AS phone
           FROM outbox_recipients r
           JOIN profiles p ON p.id = r.profile_id
          WHERE r.outbox_id = $1 AND p.mobile_e164 IS NOT NULL`,
        [outboxId]
      );
      const recipients = recipientRows.map(r => r.phone).filter(Boolean);

      if (recipients.length === 0) {
        // No recipients → mark as error and continue
        await query(`UPDATE outbox SET status = 'error' WHERE id = $1`, [outboxId]);
        continue;
      }

      let allSent = true;
      for (const phone of recipients) {
        try {
          await sendSMS({ to: phone, message });
        } catch (err) {
          allSent = false;
          // eslint-disable-next-line no-console
          console.error(`[Outbox] Error sending SMS to ${phone} for outbox ${outboxId}:`, err);
        }
      }

      // Update status based on outcome
      const newStatus = allSent ? 'sent' : 'error';
      await query(`UPDATE outbox SET status = $2 WHERE id = $1`, [outboxId, newStatus]);
      processed += 1;
    }

    return res.status(200).json({ success: true, processed });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[Outbox API] Error processing outbox messages:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
