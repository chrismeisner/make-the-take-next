// File: /pages/api/prop.js
import Airtable from "airtable";

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY })
  .base(process.env.AIRTABLE_BASE_ID);

export default async function handler(req, res) {
  const { propID } = req.query;
  if (!propID) {
	return res
	  .status(400)
	  .json({ success: false, error: "Missing propID query parameter" });
  }

  try {
	// 1) Fetch the single Props record by propID
	const records = await base("Props")
	  .select({
		filterByFormula: `{propID} = "${propID}"`,
		maxRecords: 1,
	  })
	  .firstPage();

	if (!records || records.length === 0) {
	  return res
		.status(404)
		.json({ success: false, error: `Prop not found for propID="${propID}"` });
	}

	// Extract fields from the first (and only) matching record
	const record = records[0];
	const data = record.fields;
	const createdAt = record._rawJson.createdTime;

	// 2) Enumerate the Takes table to count records for this Prop by matching the propID field
	const takeRecords = await base("Takes").select({
	  filterByFormula: `{propID} = "${propID}"`
	}).all();
	let sideACount = 0;
	let sideBCount = 0;
	takeRecords.forEach((t) => {
	  if (t.fields.propSide === "A") {
		sideACount++;
	  } else if (t.fields.propSide === "B") {
		sideBCount++;
	  }
	});
	// Print debug logs for counts and percentage calculations
	console.log(`[API /prop] propID=${propID} counts: sideACount=${sideACount}, sideBCount=${sideBCount}, total=${sideACount + sideBCount}`);
	const totalTakes = sideACount + sideBCount;
	const sideAPct = totalTakes === 0 ? 50 : Math.round((sideACount / totalTakes) * 100);
	const sideBPct = totalTakes === 0 ? 50 : Math.round((sideBCount / totalTakes) * 100);
	console.log(`[API /prop] computed percentages: sideAPct=${sideAPct}%, sideBPct=${sideBPct}%`);

	// 3) Optionally parse subject logos & content images
	let subjectLogoUrls = [];
	if (Array.isArray(data.subjectLogo) && data.subjectLogo.length > 0) {
	  subjectLogoUrls = data.subjectLogo.map((logo) => logo.url || "");
	}

	let contentImageUrl = "";
	if (Array.isArray(data.contentImage) && data.contentImage.length > 0) {
	  contentImageUrl = data.contentImage[0].url || "";
	}

	// Build a list of related content, if your schema has contentTitles & contentURLs
	const contentTitles = data.contentTitles || [];
	const contentURLs = data.contentURLs || [];
	const contentList = contentTitles.map((title, i) => ({
	  contentTitle: title,
	  contentURL: contentURLs[i] || "",
	}));

	// 4) Return the fields + newly read sideACount/sideBCount
	return res.status(200).json({
	  success: true,
	  propID,
	  createdAt,
	  // If you still want the other fields:
	  ...data,
	  subjectLogoUrls,
	  contentImageUrl,
	  content: contentList,
	  // The key new fields for your widget:
	  sideACount,
	  sideBCount,
	});
  } catch (error) {
	console.error("[API /prop] Error:", error);
	return res
	  .status(500)
	  .json({ success: false, error: "Server error fetching prop data" });
  }
}
