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
  // Fetch linked Event record early so we can attach espnGameID and eventLeague to props
  const eventIDs = packFields.Event || [];
  let espnGameID = null;
  let eventLeague = null;
  if (eventIDs.length > 0) {
    const firstEventID = eventIDs[0];
    try {
      const eventRec = await base("Events").find(firstEventID);
      const ef = eventRec.fields;
      espnGameID = ef.espnGameID || null;
      eventLeague = ef.eventLeague || null;
      console.log(`[api/packs/[packURL]] Found Event ${firstEventID}: espnGameID=${espnGameID}, eventLeague=${eventLeague}`);
    } catch (err) {
      console.error(`[api/packs/[packURL]] Error fetching Event ${firstEventID}:`, err);
    }
  }
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
          // Do not sort in Airtable; we'll sort per-pack using propOrderByPack
		  maxRecords: 100,
		})
		.all();

	  console.log("[packURL] propsRecords length =>", propsRecords.length);
      // Compute per-pack order using propOrderByPack JSON text; fallback to default, then numeric propOrder
      const packRecordId = packRecord.id;
      const getPerPackOrder = (rec) => {
        try {
          const f = rec.fields || {};
          const raw = f.propOrderByPack;
          if (typeof raw === 'string' && raw.trim()) {
            const map = JSON.parse(raw);
            if (map && Object.prototype.hasOwnProperty.call(map, packRecordId) && typeof map[packRecordId] === 'number') {
              return map[packRecordId];
            }
            if (map && Object.prototype.hasOwnProperty.call(map, 'default') && typeof map.default === 'number') {
              return map.default;
            }
          }
        } catch {}
        const po = rec.fields && typeof rec.fields.propOrder === 'number' ? rec.fields.propOrder : 0;
        return po;
      };
      propsRecords.sort((a, b) => getPerPackOrder(a) - getPerPackOrder(b));

	  propsData = propsRecords.map((record) => {
		const f = record.fields;
		console.log(`[api/packs/[packURL]] Building prop ${record.id}: espnGameID=${espnGameID}, eventLeague=${eventLeague}`);
		// support dynamic sides for superprops
		const sideCount = f.sideCount || 2;
		const sideLabels = Array.from({ length: sideCount }, (_, i) => {
		  const letter = String.fromCharCode(65 + i);
		  return f[`PropSide${letter}Short`] || f[`propSide${letter}Short`] || "";
		});

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
			// Resolve prop cover based on propCoverSource
			// - "custom": use attachment field on Props: propCover
			// - "event": use lookup field on Props: eventCover (attachments from linked Event)
			let propCover = [];
			const coverSource = String(f.propCoverSource || 'custom').toLowerCase();
			if (coverSource === 'event' && Array.isArray(f.eventCover) && f.eventCover.length > 0) {
				propCover = f.eventCover.map((img) => ({
					url: img.url,
					filename: img.filename,
				}));
			} else if (Array.isArray(f.propCover)) {
				propCover = f.propCover.map((img) => ({
					url: img.url,
					filename: img.filename,
				}));
			}

		return {
		  airtableId: record.id,
		  propID: f.propID || null,
		  propTitle: f.propTitle || "Untitled",
		  propSummary: f.propSummary || "",
		  propShort: f.propShort || f.PropShort || "",
		  propStatus: f.propStatus || "open",
		  propResult: f.propResult || "",
		  // dynamic side info
		  sideCount,
		  sideLabels,
		  // backward compatibility for two sides
		  sideALabel: sideLabels[0] || "",
		  sideBLabel: sideLabels[1] || "",
		  // expose the actual take text for each side
		  propSideATake: f.PropSideATake || "",
		  propSideBTake: f.PropSideBTake || "",
		  // Add value-model fields for Vegas valueModel
		  propValueModel: f.propValueModel || null,
		  propSideAValue: f.propSideAValue || null,
		  propSideBValue: f.propSideBValue || null,
		  contentImageUrls,
		  contentLinks,
		  propCover,
		  propOrder: f.propOrder || 0,
		  // new per-prop ESPN lookup fields
		  propESPNLookup: f.propESPNLookup || null,
		  propLeagueLookup: f.propLeagueLookup || null,
		  espnGameID,
		  eventLeague,
		  // Event time lookup on the prop record
		  propEventTimeLookup: f.propEventTimeLookup || null,
		  propEventTitleLookup: f.propEventTitleLookup || null,
		  propEventMatchup: f.propEventMatchup || null,
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
	// 4a. Linked Event record => eventTime (pack-level only)
	// ---------------------------------------------
	const linkedEventIDs = packFields.Event || [];
	let packEventTime = null;
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
		homeTeam = eventFields.homeTeamLink || null;
		awayTeam = eventFields.awayTeamLink || null;
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

	// Fetch linked Teams for event
	let homeTeamInfo = null;
	let awayTeamInfo = null;
	if (homeTeam) {
	  const homeId = Array.isArray(homeTeam) ? homeTeam[0] : homeTeam;
	  try {
		const homeRec = await base("Teams").find(homeId);
		// Determine slug from fields.teamSlug, fallback to fields.teamID or record id
		const resolvedHomeSlug = homeRec.fields.teamSlug || homeRec.fields.teamID || homeRec.id;
		homeTeamInfo = {
		  recordId: homeRec.id,
		  teamSlug: resolvedHomeSlug,
		  teamName: homeRec.fields.teamName || "",
		  teamNameFull: homeRec.fields.teamNameFull || homeRec.fields.teamName || "",
		  teamLogo: Array.isArray(homeRec.fields.teamLogo)
			? homeRec.fields.teamLogo.map(img => ({ url: img.url, filename: img.filename }))
			: [],
		};
	  } catch (err) {
		console.error("[packURL] Error fetching homeTeam =>", err);
	  }
	}
	if (awayTeam) {
	  const awayId = Array.isArray(awayTeam) ? awayTeam[0] : awayTeam;
	  try {
		const awayRec = await base("Teams").find(awayId);
		// Determine slug from fields.teamSlug, fallback to fields.teamID or record id
		const resolvedAwaySlug = awayRec.fields.teamSlug || awayRec.fields.teamID || awayRec.id;
		awayTeamInfo = {
		  recordId: awayRec.id,
		  teamSlug: resolvedAwaySlug,
		  teamName: awayRec.fields.teamName || "",
		  teamNameFull: awayRec.fields.teamNameFull || awayRec.fields.teamName || "",
		  teamLogo: Array.isArray(awayRec.fields.teamLogo)
			? awayRec.fields.teamLogo.map(img => ({ url: img.url, filename: img.filename }))
			: [],
		};
	  } catch (err) {
		console.error("[packURL] Error fetching awayTeam =>", err);
	  }
	}

	const packData = {
	  packID: packFields.packID,
	  packTitle: packFields.packTitle || "Untitled Pack",
	  packSummary: packFields.packSummary || "",
	  packType: packFields.packType || "",
	  packLeague: packFields.packLeague || null,
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
	  homeTeam: homeTeamInfo,
	  awayTeam: awayTeamInfo,
	  homeTeamScore,
	  awayTeamScore,
	  contentData,
	  contests: contestsData, // new array with {contestID, contestTitle, contestPrize}
	};

	console.log("[packURL] packData =>", packData);
	// Fetch all profiles to map phone -> profileID
	const allProfiles = await base('Profiles').select({ maxRecords: 5000 }).all();
	const phoneToProfileID = new Map();
	allProfiles.forEach((profile) => {
	  const { profileMobile, profileID } = profile.fields;
	  if (profileMobile && profileID) {
		phoneToProfileID.set(profileMobile, profileID);
	  }
	});

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
