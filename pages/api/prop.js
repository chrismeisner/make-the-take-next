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
	// Only count active takes (exclude overwritten)
	const sideCount = Number(data.sideCount) || 2;
	const takeRecords = await base("Takes")
	  .select({
		filterByFormula: `AND({propID} = "${propID}", {takeStatus} != "overwritten")`,
	  })
	  .all();
	// Build a map of counts per side value
	const countsMap = {};
	takeRecords.forEach((t) => {
	  const side = t.fields.propSide;
	  countsMap[side] = (countsMap[side] || 0) + 1;
	});
	const totalTakes = takeRecords.length;
	// Build choices array for each side based on sideCount
	const choices = [];
	for (let i = 0; i < sideCount; i++) {
	  const letter = String.fromCharCode(65 + i); // 'A' code is 65
	  const count = countsMap[letter] || 0;
	  const percentage =
		totalTakes === 0
		  ? Math.round(100 / sideCount)
		  : Math.round((count / totalTakes) * 100);
	  choices.push({
		value: letter,
		label: data[`PropSide${letter}Short`] || `Side ${letter}`,
		count,
		percentage,
	  });
	}

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
	  sideCount,
	  choices,
	  // legacy counts for backward compatibility
	  sideACount: countsMap['A'] || 0,
	  sideBCount: countsMap['B'] || 0,
	});
  } catch (error) {
	console.error("[API /prop] Error:", error);
	return res
	  .status(500)
	  .json({ success: false, error: "Server error fetching prop data" });
  }
}
