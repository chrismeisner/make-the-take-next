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

    const { packURL, packTitle, receiptId, takeTexts = [], ref } = req.body || {};
    if (!packURL) {
      return res.status(400).json({ success: false, error: "Missing packURL" });
    }

    const siteUrl = process.env.SITE_URL || `https://${req.headers.host}`;
    const baseUrl = `${siteUrl}/packs/${encodeURIComponent(packURL)}`;
    const packDetailUrl = ref ? `${baseUrl}?ref=${encodeURIComponent(ref)}` : baseUrl;

    const lines = [];
    lines.push(`I just made my takes on ${packTitle || packURL}`);
    if (Array.isArray(takeTexts) && takeTexts.length > 0) {
      for (const t of takeTexts) {
        const txt = String(t || '').trim();
        if (txt) lines.push(`🔮 ${txt}`);
      }
    }
    lines.push(`Think you can beat my takes?`);
    lines.push(packDetailUrl);
    const message = lines.join('\n');

    await sendSMS({ to: session.user.phone, message });
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("[notifyPackSubmitted] Error:", err);
    return res.status(500).json({ success: false, error: "Failed to send SMS" });
  }
}


