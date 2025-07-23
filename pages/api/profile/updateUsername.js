import Airtable from "airtable";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY })
  .base(process.env.AIRTABLE_BASE_ID);

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  if (!session?.user?.airtableId) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const { username } = req.body;
  if (!username || !/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
    return res.status(400).json({ error: "Invalid username" });
  }
  try {
    const { airtableId } = session.user;
    const existing = await base("Profiles")
      .select({
        filterByFormula: `{profileID} = "${username}"`,
        maxRecords: 1,
      })
      .all();
    if (existing.length > 0) {
      return res.status(409).json({ error: "Username already taken" });
    }
    const updated = await base("Profiles").update([
      {
        id: airtableId,
        fields: { profileID: username },
      },
    ]);
    return res.status(200).json({ success: true, profile: updated[0].fields });
  } catch (err) {
    console.error("[updateUsername] Error:", err);
    return res.status(500).json({ error: "Server error" });
  }
} 