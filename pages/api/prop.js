// File: /pages/api/prop.js
import { createRepositories } from "../../lib/dal/factory";
import { getDataBackend } from "../../lib/runtimeConfig";
import { AirtablePropsRepository } from "../../lib/dal/airtable/props";
import { AirtableTakesRepository } from "../../lib/dal/airtable/takes";
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

	// Optional shadow read: compare against alternate backend and log any mismatches
	try {
	  if (process.env.SHADOW_READS === '1') {
		const backend = getDataBackend();
		const altProps = backend === 'postgres' ? new AirtablePropsRepository() : new PostgresPropsRepository();
		const altTakes = backend === 'postgres' ? new AirtableTakesRepository() : new PostgresTakesRepository();
		const altProp = await altProps.getByPropID(propID);
		if (altProp) {
		  const altCounts = await altTakes.countBySides(propID);
		  const diffs = [];
		  const cmp = (kA, kB = kA) => {
			const a = data[kA];
			const b = altProp[kB];
			if (JSON.stringify(a) !== JSON.stringify(b)) diffs.push(`${kA}!=${kB}`);
		  };
		  cmp('prop_short', 'prop_short');
		  cmp('propStatus', 'prop_status');
		  cmp('sideCount', 'side_count');
		  cmp('moneyline_a', 'moneyline_a');
		  cmp('moneyline_b', 'moneyline_b');
		  if ((countsMap.A || 0) !== (altCounts.A || 0) || (countsMap.B || 0) !== (altCounts.B || 0)) {
			diffs.push('takeCounts');
		  }
		  if (diffs.length) {
			console.warn(`[shadow /api/prop] backend=${backend} propID=${propID} diffs=`, diffs);
		  }
		}
	  }
	} catch (shadowErr) {
	  console.warn('[shadow /api/prop] shadow read failed =>', shadowErr?.message || shadowErr);
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
