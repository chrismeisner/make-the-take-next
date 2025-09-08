import Airtable from "airtable";
import { getDataBackend } from "../../../lib/runtimeConfig";
import { getCurrentUser } from "../../../lib/auth";
import { query } from "../../../lib/db/postgres";

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY })
  .base(process.env.AIRTABLE_BASE_ID);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const currentUser = await getCurrentUser(req);
  if (!currentUser) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const { username } = req.body;
  if (!username || !/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
    return res.status(400).json({ error: "Invalid username" });
  }

  try {
    const backend = getDataBackend();
    if (backend === "postgres") {
      // Ensure uniqueness (case-insensitive)
      const { rows: taken } = await query(
        "SELECT 1 FROM profiles WHERE LOWER(username) = LOWER($1) LIMIT 1",
        [username]
      );
      if (taken.length > 0) {
        return res.status(409).json({ error: "Username already taken" });
      }
      // Update current user's username
      await query("UPDATE profiles SET username = $1 WHERE id = $2", [username, currentUser.userId]);
      return res.status(200).json({ success: true, profile: { username } });
    }

    // Airtable path: find by phone and update profileID field
    const existing = await base("Profiles")
      .select({ filterByFormula: `{profileID} = "${username}"`, maxRecords: 1 })
      .all();
    if (existing.length > 0) {
      return res.status(409).json({ error: "Username already taken" });
    }
    // Resolve the record by phone
    const byPhone = await base("Profiles")
      .select({ filterByFormula: `{profileMobile} = "${currentUser.phone}"`, maxRecords: 1 })
      .all();
    if (byPhone.length === 0) {
      return res.status(404).json({ error: "Profile not found" });
    }
    const updated = await base("Profiles").update([
      { id: byPhone[0].id, fields: { profileID: username } },
    ]);
    return res.status(200).json({ success: true, profile: updated[0].fields });
  } catch (err) {
    console.error("[updateUsername] Error:", err);
    return res.status(500).json({ error: "Server error" });
  }
}