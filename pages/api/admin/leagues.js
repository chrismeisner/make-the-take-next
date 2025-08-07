import { getToken } from "next-auth/jwt";
import { getEventLeagues } from "../../../lib/airtableService";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) {
    return res.status(401).json({ success: false, error: "Unauthorized" });
  }
  try {
    const leagues = await getEventLeagues();
    return res.status(200).json({ success: true, leagues });
  } catch (e) {
    console.error("[api/admin/leagues] error:", e);
    return res.status(500).json({ success: false, error: e.message });
  }
}