import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import { sendSMS } from "../../../lib/twilioService";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ success: false, error: "Method Not Allowed" });
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session?.user?.phone) {
    return res.status(401).json({ success: false, error: "Not authenticated" });
  }
  console.log("[sendHelloText] Session user:", session.user);
  const to = session.user.phone;
  const fromNumber = process.env.TWILIO_FROM_NUMBER;
  console.log(`[sendHelloText] Preparing to send SMS from ${fromNumber} to ${to} with message 'Hello'`);

  try {
    const msg = await sendSMS({ to, message: "Hello" });
    console.log(`[sendHelloText] SMS sent. Twilio message info: SID=${msg.sid}, status=${msg.status}, from=${msg.from}, to=${msg.to}`);
    // Include 'from' in the response so UI can display both numbers
    return res.status(200).json({ success: true, from: msg.from, to });
  } catch (error) {
    console.error(`[sendHelloText] Error sending SMS from ${fromNumber} to ${to}:`, error);
    return res.status(500).json({ success: false, error: "Failed to send SMS" });
  }
}