import Airtable from "airtable";

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(
  process.env.AIRTABLE_BASE_ID
);

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }
  try {
    // Filter for profiles with the creator checkbox checked (support common casing variants)
    const filterByFormula = "OR({creator}=1, {Creator}=1)";
    const records = await base("Profiles")
      .select({ filterByFormula, maxRecords: 5000 })
      .all();
    const creators = records.map((rec) => {
      const f = rec.fields || {};
      return {
        airtableId: rec.id,
        profileID: f.profileID || rec.id,
        profileUsername: f.profileUsername || null,
        profileAvatarUrl: Array.isArray(f.profileAvatar) && f.profileAvatar[0]?.url ? f.profileAvatar[0].url : null,
      };
    });
    return res.status(200).json({ success: true, creators });
  } catch (err) {
    console.error("[api/admin/creators] Error =>", err);
    return res.status(500).json({ success: false, error: "Failed to fetch creators" });
  }
}


