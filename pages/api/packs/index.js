import Airtable from "airtable";

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY })
  .base(process.env.AIRTABLE_BASE_ID);

export default async function handler(req, res) {
  if (req.method !== "GET") {
	return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  try {
	// Fetch all active packs
	const packRecords = await base("Packs")
	  .select({
		filterByFormula: `{packStatus} = "Active"`, // Filter for active packs only
		maxRecords: 100,
	  })
	  .all();

	const packsData = packRecords.map((record) => {
	  const fields = record.fields;
	  return {
		packID: fields.packID || record.id,
		packTitle: fields.packTitle || "Untitled Pack",
		packURL: fields.packURL || "",
		packCover: fields.packCover ? fields.packCover[0]?.url : null,
		packPrize: fields.packPrize || "",
		prizeSummary: fields.prizeSummary || "",
		packSummary: fields.packSummary || "",
	  };
	});

	// Return the response as JSON
	res.status(200).json({ success: true, packs: packsData });
  } catch (error) {
	console.error("[/api/packs/index] Error =>", error);
	return res.status(500).json({ success: false, error: "Failed to fetch packs." });
  }
}
