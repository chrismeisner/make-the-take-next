// File: /pages/api/packs/notify.js

import { getCurrentUser } from "../../../lib/auth";
import { query } from "../../../lib/db/postgres";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    const { packURL } = req.body || {};
    if (!packURL || typeof packURL !== 'string') {
      return res.status(400).json({ success: false, error: "Missing packURL" });
    }

    // Resolve pack UUID from packURL
    const { rows: packRows } = await query(
      `SELECT id FROM packs WHERE pack_url = $1 LIMIT 1`,
      [packURL]
    );
    if (packRows.length === 0) {
      return res.status(404).json({ success: false, error: "Pack not found" });
    }
    const packId = packRows[0].id;

    // Resolve profile UUID from current user (prefer phone lookup)
    const { rows: profRows } = await query(
      `SELECT id FROM profiles WHERE mobile_e164 = $1 OR profile_id = $2 LIMIT 1`,
      [user.phone || null, user.profileID || null]
    );
    if (profRows.length === 0) {
      return res.status(404).json({ success: false, error: "Profile not found" });
    }
    const profileId = profRows[0].id;

    // Insert subscription (idempotent)
    const { rows: inserted } = await query(
      `INSERT INTO pack_notifications (pack_id, profile_id)
         VALUES ($1, $2)
         ON CONFLICT DO NOTHING
         RETURNING 1`,
      [packId, profileId]
    );

    const alreadySubscribed = inserted.length === 0;

    return res.status(200).json({ success: true, alreadySubscribed });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[/api/packs/notify] Error:", err);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
}


