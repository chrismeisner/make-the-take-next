import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth/[...nextauth]";
import { sendSMS } from "../../lib/twilioService";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  try {
    const session = await getServerSession(req, res, authOptions);
    if (!session?.user?.phone) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    const { packURL, packTitle, receiptId } = req.body || {};
    if (!packURL) {
      return res.status(400).json({ success: false, error: "Missing packURL" });
    }

    const siteUrl = process.env.SITE_URL || `https://${req.headers.host}`;
    const packDetailUrl = `${siteUrl}/packs/${encodeURIComponent(packURL)}`;

    const message = `✅ Takes received for "${packTitle || packURL}". ${packDetailUrl}`;

    await sendSMS({ to: session.user.phone, message });
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("[notifyPackSubmitted] Error:", err);
    return res.status(500).json({ success: false, error: "Failed to send SMS" });
  }
}


