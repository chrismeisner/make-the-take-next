import { getToken } from "next-auth/jwt";
import Airtable from "airtable";

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY })
  .base(process.env.AIRTABLE_BASE_ID);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) {
    return res.status(401).json({ success: false, error: "Unauthorized" });
  }
  try {
    // Fetch props with status 'open' and close time before now
    const recordsToClose = await base("Props")
      .select({
        filterByFormula: 'AND({propStatus}="open", IS_AFTER(NOW(), {propCloseTime}))'
      })
      .all();
    const closedCount = recordsToClose.length;
    if (closedCount > 0) {
      const updates = recordsToClose.map(rec => ({
        id: rec.id,
        fields: { propStatus: "closed" }
      }));
      await base("Props").update(updates);
    }
    return res.status(200).json({ success: true, closedCount });
  } catch (error) {
    console.error("[admin/closeProps] Error closing props:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
