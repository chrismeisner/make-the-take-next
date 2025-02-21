// File: /pages/api/packs/[packURL].js

import Airtable from "airtable";

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY })
  .base(process.env.AIRTABLE_BASE_ID);

export default async function handler(req, res) {
  if (req.method !== "GET") {
	console.log("[packURL] Method not allowed:", req.method);
	return res
	  .status(405)
	  .json({ success: false, error: "Method not allowed" });
  }

  const { packURL } = req.query;
  if (!packURL) {
	console.log("[packURL] Missing packURL parameter");
	return res
	  .status(400)
	  .json({ success: false, error: "Missing packURL parameter" });
  }

  console.log("[packURL] Received request =>", packURL);

  try {
	// 1. Fetch the pack record by packURL
	console.log("[packURL] Querying Packs table => packURL:", packURL);
	const packRecords = await base("Packs")
	  .select({
		filterByFormula: `{packURL} = "${packURL}"`,
		maxRecords: 1,
	  })
	  .firstPage();

	console.log("[packURL] packRecords length =>", packRecords.length);
	if (!packRecords || packRecords.length === 0) {
	  console.log("[packURL] No pack found for:", packURL);
	  return res
		.status(404)
		.json({ success: false, error: "Pack not found" });
	}

	const packRecord = packRecords[0];
	const packFields = packRecord.fields;

	// ---------------------------------------------
	// 2. Fetch linked Props (existing logic)
	// ---------------------------------------------
	const linkedPropIDs = packFields.Props || [];
	console.log("[packURL] linkedPropIDs =>", linkedPropIDs);

	let propsData = [];
	if (linkedPropIDs.length > 0) {
	  const formula = `OR(${linkedPropIDs
		.map((id) => `RECORD_ID()='${id}'`)
		.join(",")})`;
	  console.log("[packURL] Props formula =>", formula);

	  const propsRecords = await base("Props")
		.select({
		  filterByFormula: formula,
		  maxRecords: 100,
		})
		.all();

	  console.log("[packURL] propsRecords length =>", propsRecords.length);

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

	// ---------------------------------------------
	// 3. Parse packPrizeImage and packCover fields
	// ---------------------------------------------
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

	// ---------------------------------------------
	// 4a. (Optional) Fetch linked Event record
	// ---------------------------------------------
	const linkedEventIDs = packFields.Event || [];
	let packEventTime = null;
	if (linkedEventIDs.length > 0) {
	  const firstEventID = linkedEventIDs[0];
	  console.log("[packURL] fetching Event record =>", firstEventID);

	  const eventRecords = await base("Events")
		.select({
		  filterByFormula: `RECORD_ID()="${firstEventID}"`,
		  maxRecords: 1,
		})
		.all();
	  if (eventRecords.length > 0) {
		const eventFields = eventRecords[0].fields;
		packEventTime = eventFields.eventTime || null;
		console.log("[packURL] Found eventTime =>", packEventTime);
	  }
	}

	// ---------------------------------------------
	// 4b. Fetch linked Content records (optional)
	// ---------------------------------------------
	const linkedContentIDs = packFields.Content || [];
	let contentData = [];
	if (linkedContentIDs.length > 0) {
	  console.log("[packURL] fetching Content =>", linkedContentIDs);
	  const contentFormula = `OR(${linkedContentIDs
		.map((id) => `RECORD_ID()="${id}"`)
		.join(",")})`;

	  const contentRecords = await base("Content")
		.select({
		  filterByFormula: contentFormula,
		  maxRecords: 50,
		})
		.all();

	  console.log("[packURL] contentRecords length =>", contentRecords.length);

	  contentData = contentRecords.map((rec) => {
		const cf = rec.fields;
		let contentImage = null;
		if (Array.isArray(cf.contentImage) && cf.contentImage.length > 0) {
		  contentImage = cf.contentImage[0].url;
		}

		return {
		  airtableId: rec.id,
		  contentTitle: cf.contentTitle || "Untitled",
		  contentSource: cf.contentSource || "",
		  contentURL: cf.contentURL || "#",
		  contentImage,
		};
	  });
	}

	// ---------------------------------------------
	// 4c. Fetch linked Contests (the new part)
	// ---------------------------------------------
	const linkedContestIDs = packFields.Contests || [];
	let contestsData = [];
	if (linkedContestIDs.length > 0) {
	  console.log("[packURL] fetching Contests =>", linkedContestIDs);
	  const contestFormula = `OR(${linkedContestIDs
		.map((id) => `RECORD_ID()="${id}"`)
		.join(",")})`;

	  const contestRecords = await base("Contests")
		.select({
		  filterByFormula: contestFormula,
		  maxRecords: 50,
		})
		.all();

	  console.log("[packURL] contestRecords length =>", contestRecords.length);

	  contestsData = contestRecords.map((rec) => {
		const cf = rec.fields;
		return {
		  airtableId: rec.id,
		  contestID: cf.contestID || "",
		  contestTitle: cf.contestTitle || "Untitled Contest",
		  // add any other relevant fields from your "Contests" table
		};
	  });
	}

	// ---------------------------------------------
	// 5. Consolidate pack data
	// ---------------------------------------------
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
	  eventTime: packEventTime,
	  contentData, // from "Content"
	  contests: contestsData, // new array of linked Contests
	};

	console.log("[packURL] packData =>", packData);

	// ---------------------------------------------
	// 6. Build leaderboard as before
	// ---------------------------------------------
	const linkedTakesIds = packFields.Takes || [];
	console.log("[packURL] linkedTakesIds =>", linkedTakesIds);

	let leaderboard = [];
	if (linkedTakesIds.length > 0) {
	  const orFormula = `OR(${linkedTakesIds
		.map((id) => `RECORD_ID()="${id}"`)
		.join(",")})`;
	  console.log("[packURL] Takes formula =>", orFormula);

	  const takesRecords = await base("Takes")
		.select({
		  filterByFormula: orFormula,
		  maxRecords: 10000,
		})
		.all();

	  console.log("[packURL] takesRecords length =>", takesRecords.length);

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

	console.log("[packURL] final leaderboard =>", leaderboard);

	// 7. Return success
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
