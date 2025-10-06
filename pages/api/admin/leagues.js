import { getToken } from "next-auth/jwt";
import { query } from "../../../lib/db/postgres";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) {
    return res.status(401).json({ success: false, error: "Unauthorized" });
  }
  try {
    const { rows } = await query(
      `SELECT DISTINCT league
         FROM events
        WHERE league IS NOT NULL AND league <> ''
        ORDER BY league`
    );
    const leagues = rows.map(r => r.league);
    return res.status(200).json({ success: true, leagues });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[api/admin/leagues] error:", e);
    return res.status(500).json({ success: false, error: e.message });
  }
}