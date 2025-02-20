//pages/api/packs/[packURL].js 

import Airtable from "airtable";

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(
  process.env.AIRTABLE_BASE_ID
);

export default async function handler(req, res) {
  if (req.method !== "GET") {
	return res
	  .status(405)
	  .json({ success: false, error: "Method not allowed" });
  }

  const { packURL } = req.query;
  if (!packURL) {
	return res
	  .status(400)
	  .json({ success: false, error: "Missing packURL parameter" });
  }

  try {
	// 1. Fetch the pack record by packURL.
	const packRecords = await base("Packs")
	  .select({
		filterByFormula: `{packURL} = "${packURL}"`,
		maxRecords: 1,
	  })
	  .firstPage();

	if (!packRecords || packRecords.length === 0) {
	  return res
		.status(404)
		.json({ success: false, error: "Pack not found" });
	}

	const packRecord = packRecords[0];
	const packFields = packRecord.fields;

	// 2. Fetch linked Props.
	const linkedPropIDs = packFields.Props || [];
	let propsData = [];
	if (linkedPropIDs.length > 0) {
	  const formula = `OR(${linkedPropIDs
		.map((id) => `RECORD_ID()='${id}'`)
		.join(",")})`;
	  const propsRecords = await base("Props")
		.select({ filterByFormula: formula, maxRecords: 100 })
		.all();

	  propsData = propsRecords.map((record) => {
		const f = record.fields;
		let contentImageUrls = [];
		if (Array.isArray(f.contentImage)) {
		  contentImageUrls = f.contentImage.map((img) => ({
			url: img.url,
			filename: img.filename,
		  }));
		}
		const contentTitles = Array.isArray(f.contentTitles)
		  ? f.contentTitles
		  : [];
		const contentURLs = Array.isArray(f.contentURLs)
		  ? f.contentURLs
		  : [];
		const contentLinks = contentTitles.map((title, i) => {
		  const url = contentURLs[i] || "#";
		  return { title, url };
		});
		return {
		  airtableId: record.id,
		  propID: f.propID || null,
		  propTitle: f.propTitle || "Untitled",
		  propSummary: f.propSummary || "",
		  propStatus: f.propStatus || "open",
		  contentImageUrls,
		  contentLinks,
		  propOrder: f.propOrder || 0,
		};
	  });
	}

	// 3. Parse packPrizeImage and packCover fields.
	let packPrizeImage = [];
	if (Array.isArray(packFields.packPrizeImage)) {
	  packPrizeImage = packFields.packPrizeImage.map((img) => ({
		url: img.url,
		filename: img.filename,
	  }));
	}
	let packCover = [];
	if (Array.isArray(packFields.packCover)) {
	  packCover = packFields.packCover.map((img) => ({
		url: img.url,
		filename: img.filename,
	  }));
	}

	// 4. Consolidate pack data.
	const packData = {
	  packID: packFields.packID,
	  packTitle: packFields.packTitle || "Untitled Pack",
	  packURL: packFields.packURL,
	  props: propsData,
	  packPrize: packFields.packPrize || "",
	  packPrizeImage,
	  prizeSummary: packFields.prizeSummary || "",
	  packPrizeURL: packFields.packPrizeURL || "",
	  packCover,
	};

	// 5. Fetch leaderboard data for this pack.
	const linkedTakesIds = packFields.Takes || [];
	let leaderboard = [];
	if (linkedTakesIds.length > 0) {
	  const orFormula = `OR(${linkedTakesIds
		.map((id) => `RECORD_ID()="${id}"`)
		.join(",")})`;
	  const takesRecords = await base("Takes")
		.select({ filterByFormula: orFormula, maxRecords: 10000 })
		.all();

	  const phoneStats = new Map();
	  takesRecords.forEach((take) => {
		const tf = take.fields;
		if (tf.takeStatus === "overwritten") return;
		const phone = tf.takeMobile || "Unknown";
		const points = tf.takePTS || 0;
		const result = tf.takeResult || "";
		let profileID = null;
		if (tf.Profile && tf.Profile.length > 0) {
		  profileID = tf.profileID || null;
		}
		if (!phoneStats.has(phone)) {
		  phoneStats.set(phone, {
			phone,
			profileID,
			takes: 0,
			points: 0,
			won: 0,
			lost: 0,
			pending: 0,
		  });
		}
		const stats = phoneStats.get(phone);
		stats.takes += 1;
		stats.points += points;
		if (result === "Won") {
		  stats.won += 1;
		} else if (result === "Lost") {
		  stats.lost += 1;
		} else if (result === "Pending") {
		  stats.pending += 1;
		}
		phoneStats.set(phone, stats);
	  });

	  leaderboard = Array.from(phoneStats.values()).sort(
		(a, b) => b.points - a.points
	  );
	}

	return res.status(200).json({
	  success: true,
	  pack: packData,
	  leaderboard,
	});
  } catch (error) {
	console.error("[API /packs/[packURL]] => Error:", error);
	return res
	  .status(500)
	  .json({ success: false, error: "Internal server error" });
  }
}
