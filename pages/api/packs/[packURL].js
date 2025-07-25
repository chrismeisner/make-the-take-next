// File: /pages/api/packs/[packURL].js

import Airtable from "airtable";
import { aggregateTakeStats } from '../../../lib/leaderboard';

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
	// 1) Fetch the pack record by packURL
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
	  return res.status(404).json({
		success: false,
		error: "Pack not found",
	  });
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
		  // Sort props by the new propOrder field
		  sort: [{ field: "propOrder", direction: "asc" }],
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
		  propShort: f.propShort || f.PropShort || "",
		  propStatus: f.propStatus || "open",
		  propResult: f.propResult || "",
		  // static side counts removed; will compute dynamically below
		  // Include short labels for sides
		  sideALabel: f.PropSideAShort || f.propSideAShort || "Side A",
		  sideBLabel: f.PropSideBShort || f.propSideBShort || "Side B",
		  contentImageUrls,
		  contentLinks,
		  propOrder: f.propOrder || 0,
		};
	  });
	}

	// ---------------------------------------------
	// 3. Parse packPrizeImage and packCover
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
	// 4a. Linked Event record => eventTime
	// ---------------------------------------------
	const linkedEventIDs = packFields.Event || [];
	let packEventTime = null;
	let espnGameID = null;
	let eventLeague = null;
	let homeTeam = null;
	let awayTeam = null;
	let homeTeamScore = null;
	let awayTeamScore = null;
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
		espnGameID = eventFields.espnGameID || null;
		eventLeague = eventFields.eventLeague || null;
		homeTeam = eventFields.homeTeam || null;
		awayTeam = eventFields.awayTeam || null;
		homeTeamScore = eventFields.homeTeamScore ?? null;
		awayTeamScore = eventFields.awayTeamScore ?? null;
		console.log("[packURL] Found eventTime =>", packEventTime);
	  }
	}

	// ---------------------------------------------
	// 4b. Linked Content records => contentData
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
	// 4c. Linked Contests => we fetch contestTitle + contestPrize
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
		  contestPrize: cf.contestPrize || "", // optional
		};
	  });
	}

	// ---------------------------------------------
	// 5. Consolidate pack data
	// ---------------------------------------------
	// Additional pack detail fields
	let packCreatorID = null;
	if (Array.isArray(packFields.PackCreator) && packFields.PackCreator.length > 0) {
	  const creatorRecordId = packFields.PackCreator[0];
	  const profileRecs = await base("Profiles")
		.select({
		  filterByFormula: `RECORD_ID()='${creatorRecordId}'`,
		  maxRecords: 1,
		})
		.firstPage();
	  if (profileRecs.length > 0) {
		packCreatorID = profileRecs[0].fields.profileID || profileRecs[0].id;
	  }
	}
	const packData = {
	  packID: packFields.packID,
	  packTitle: packFields.packTitle || "Untitled Pack",
	  packSummary: packFields.packSummary || "",
	  packType: packFields.packType || "",
	  packCreatorID,
	  packURL: packFields.packURL,
	  props: propsData,
	  packPrize: packFields.packPrize || "",
	  packPrizeImage,
	  prizeSummary: packFields.prizeSummary || "",
	  packPrizeURL: packFields.packPrizeURL || "",
	  packCover,
	  eventTime: packEventTime,
	  espnGameID,
	  eventLeague,
	  homeTeam,
	  awayTeam,
	  homeTeamScore,
	  awayTeamScore,
	  contentData,
	  contests: contestsData, // new array with {contestID, contestTitle, contestPrize}
	};

	console.log("[packURL] packData =>", packData);

	// ---------------------------------------------
	// 6. Build leaderboard
	// ---------------------------------------------
	// Replace manual aggregation with shared helper
	const linkedTakesIds = packFields.Takes || [];
	let leaderboard = [];
	if (linkedTakesIds.length > 0) {
	  const orFormula = `OR(${linkedTakesIds.map((id) => `RECORD_ID()="${id}"`).join(",")})`;
	  const takesRecords = await base("Takes").select({
		filterByFormula: orFormula,
		maxRecords: 10000,
	  }).all();

	  // Aggregate stats using shared helper
	  const statsList = aggregateTakeStats(takesRecords);

	  // Map phone to profileID if available
	  const phoneToProfileID = new Map();
	  takesRecords.forEach((take) => {
		const tf = take.fields;
		const phoneKey = tf.takeMobile || "Unknown";
		if (tf.Profile && Array.isArray(tf.Profile) && tf.Profile.length > 0 && tf.profileID) {
		  phoneToProfileID.set(phoneKey, tf.profileID);
		}
	  });

	  leaderboard = statsList.map((s) => ({
		phone: s.phone,
		takes: s.takes,
		points: s.points,
		won: s.won,
		lost: s.lost,
		pending: s.pending,
		pushed: s.pushed,
		profileID: phoneToProfileID.get(s.phone) || null,
	  }));
	}

	console.log("[packURL] final leaderboard =>", leaderboard);

	// Return success
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
