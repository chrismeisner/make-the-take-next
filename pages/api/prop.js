// File: /pages/api/prop.js
import { createRepositories } from "../../lib/dal/factory";
import { getDataBackend } from "../../lib/runtimeConfig";
import { PostgresPropsRepository } from "../../lib/dal/postgres/props";
import { PostgresTakesRepository } from "../../lib/dal/postgres/takes";

export default async function handler(req, res) {
  const { propID } = req.query;
  if (!propID) {
	return res
	  .status(400)
	  .json({ success: false, error: "Missing propID query parameter" });
  }

  try {
	const { props, takes } = createRepositories();
	// 1) Fetch the single Prop by propID
	const prop = await props.getByPropID(propID);
	if (!prop) {
	  return res
		.status(404)
		.json({ success: false, error: `Prop not found for propID="${propID}"` });
	}

	const data = prop; // includes fields
	const createdAt = prop.createdAt;

	// 2) Count active takes for this prop
	const countsMap = await takes.countBySides(propID);
	const sideCount = Number(data.sideCount) || 2;
	const totalTakes = (countsMap.A || 0) + (countsMap.B || 0);
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

	// Optional shadow read placeholder (Airtable repositories were removed)
	try {
	  if (process.env.SHADOW_READS === '1') {
		// No alternate backend available for shadow reads.
	  }
	} catch (shadowErr) {
	  console.warn('[shadow /api/prop] shadow read skipped =>', shadowErr?.message || shadowErr);
	}

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
