import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import { query } from "../../../lib/db/postgres";
import { sendSMS } from "../../../lib/twilioService";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ success: false, error: "Method Not Allowed" });
  }

  try {
    const session = await getServerSession(req, res, authOptions);
    if (!session?.user?.superAdmin) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    const { profileID, message } = req.body || {};
    if (!profileID) {
      return res.status(400).json({ success: false, error: "Missing profileID" });
    }

    const { rows } = await query('SELECT mobile_e164 FROM profiles WHERE profile_id = $1 LIMIT 1', [profileID]);
    const phone = rows?.[0]?.mobile_e164;
    if (!phone) {
      return res.status(404).json({ success: false, error: "Profile not found or has no phone" });
    }

    const msgBody = String(message || 'Hello');
    const msg = await sendSMS({ to: phone, message: msgBody });
    return res.status(200).json({ success: true, from: msg.from, to: msg.to, sid: msg.sid });
  } catch (err) {
    console.error('[admin/sendHelloToProfile] Error:', err);
    return res.status(500).json({ success: false, error: 'Failed to send SMS' });
  }
}


