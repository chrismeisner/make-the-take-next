import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import { query } from "../../../lib/db/postgres";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ success: false, error: "Method Not Allowed" });
  }

  try {
    const session = await getServerSession(req, res, authOptions);
    if (!session?.user?.superAdmin) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    // Fetch recent profiles that have a phone number
    const limit = Math.max(1, Math.min(200, Number.parseInt(String(req.query.limit || '50'), 10)));
    const search = String(req.query.search || '').trim();
    let rows = [];
    if (search) {
      const like = `%${search.toLowerCase()}%`;
      const result = await query(
        `SELECT id, profile_id, mobile_e164
           FROM profiles
          WHERE mobile_e164 IS NOT NULL
            AND (
              LOWER(profile_id) LIKE $1 OR mobile_e164 LIKE $2
            )
          ORDER BY created_at DESC
          LIMIT $3`,
        [like, like, limit]
      );
      rows = result.rows || [];
    } else {
      const result = await query(
        `SELECT id, profile_id, mobile_e164
           FROM profiles
          WHERE mobile_e164 IS NOT NULL
          ORDER BY created_at DESC
          LIMIT $1`,
        [limit]
      );
      rows = result.rows || [];
    }

    return res.status(200).json({ success: true, profiles: rows });
  } catch (err) {
    console.error("[admin/listProfilesWithPhones] Error:", err);
    return res.status(500).json({ success: false, error: "Server error" });
  }
}


