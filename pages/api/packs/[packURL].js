// File: /pages/api/packs/[packURL].js
import Airtable from "airtable";

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(
  process.env.AIRTABLE_BASE_ID
);

export default async function handler(req, res) {
  const { packURL } = req.query;
  if (!packURL) {
	return res.status(400).json({ success: false, error: "Missing packURL parameter" });
  }
  try {
	// 1) Find the pack record matching the given packURL
	const packRecords = await base("Packs")
	  .select({
		filterByFormula: `{packURL} = "${packURL}"`,
		maxRecords: 1,
	  })
	  .firstPage();
	if (!packRecords || packRecords.length === 0) {
	  return res.status(404).json({ success: false, error: "Pack not found" });
	}
	const packRecord = packRecords[0];
	const packFields = packRecord.fields;

	// 2) Get the linked record IDs from the "Props" field (adjust the field name if needed)
	const linkedPropIDs = packFields.Props || [];
	let propsData = [];

	if (linkedPropIDs.length > 0) {
	  // Build a formula like: OR(RECORD_ID()='rec123', RECORD_ID()='rec456', ...)
	  const formula = `OR(${linkedPropIDs
		.map((id) => `RECORD_ID()='${id}'`)
		.join(",")})`;
	  const propsRecords = await base("Props")
		.select({
		  filterByFormula: formula,
		  maxRecords: 100,
		})
		.all();

	  propsData = propsRecords.map((record) => {
		const f = record.fields;
		return {
		  airtableId: record.id,
		  propID: f.propID || null,
		  propTitle: f.propTitle || "Untitled",
		  propSummary: f.propSummary || "",
		  propStatus: f.propStatus || "open",
		  // Include other fields as needed
		};
	  });
	}

	// 3) Return the pack data along with the expanded props
	return res.status(200).json({
	  success: true,
	  pack: {
		packID: packFields.packID,
		packTitle: packFields.packTitle || "Untitled Pack",
		packURL: packFields.packURL,
		props: propsData,
	  },
	});
  } catch (error) {
	console.error("Error in /api/packs/[packURL].js:", error);
	return res.status(500).json({ success: false, error: "Internal server error" });
  }
}
