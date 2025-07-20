import Airtable from "airtable";

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(
  process.env.AIRTABLE_BASE_ID
);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }
  const { packId, propIds } = req.body;
  if (!packId) {
    return res.status(400).json({ success: false, error: "Missing packId" });
  }

  try {
    // Delete any provided Prop records, else fallback to formula lookup
    if (Array.isArray(propIds) && propIds.length > 0) {
      await base("Props").destroy(propIds);
    } else {
      const propsToDelete = await base("Props").select({
        filterByFormula: `FIND('${packId}', ARRAYJOIN({Packs}, ','))`,
        maxRecords: 1000,
      }).all();
      const toDeleteIds = propsToDelete.map((rec) => rec.id);
      if (toDeleteIds.length > 0) {
        await base("Props").destroy(toDeleteIds);
      }
    }
    // Delete the Pack
    await base("Packs").destroy([packId]);

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("[api/admin/deletePack] Error =>", error);
    return res.status(500).json({ success: false, error: "Failed to delete pack and props" });
  }
} 