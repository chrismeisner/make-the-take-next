// File: /pages/api/packs/[packURL].js

import Airtable from "airtable";
import { createRepositories } from '../../../lib/dal/factory';
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
	// 1) Fetch the pack record by packURL via DAL
	const { packs } = createRepositories();
	const pack = await packs.getByPackURL(packURL);
	if (!pack) {
	  console.log("[packURL] No pack found for:", packURL);
	  return res.status(404).json({ success: false, error: "Pack not found" });
	}
	const packFields = pack;
	const packRecordId = pack.id;
  // Fetch linked Event record early so we can attach espnGameID and eventLeague to props
  const eventIDs = packFields.Event || [];
  let espnGameID = null;
  let eventLeague = null;
  // New: home/away team logos available early for prop cover resolution
  let homeTeamInfoCover = null;
  let awayTeamInfoCover = null;
  if (eventIDs.length > 0) {
    const firstEventID = eventIDs[0];
    try {
      const eventRec = await base("Events").find(firstEventID);
      const ef = eventRec.fields;
      espnGameID = ef.espnGameID || null;
      eventLeague = ef.eventLeague || null;
      console.log(`[api/packs/[packURL]] Found Event ${firstEventID}: espnGameID=${espnGameID}, eventLeague=${eventLeague}`);
      // Resolve team logos for hometeam/awayteam propCoverSource
      const homeLink = ef.homeTeamLink || null;
      const awayLink = ef.awayTeamLink || null;
      if (homeLink) {
        const homeId = Array.isArray(homeLink) ? homeLink[0] : homeLink;
        try {
          const homeRec = await base("Teams").find(homeId);
          homeTeamInfoCover = {
            recordId: homeRec.id,
            teamLogo: Array.isArray(homeRec.fields.teamLogo)
              ? homeRec.fields.teamLogo.map(img => ({ url: img.url, filename: img.filename }))
              : [],
            teamLogoURL: homeRec.fields.teamLogoURL || null,
          };
        } catch {}
      }
      if (awayLink) {
        const awayId = Array.isArray(awayLink) ? awayLink[0] : awayLink;
        try {
          const awayRec = await base("Teams").find(awayId);
          awayTeamInfoCover = {
            recordId: awayRec.id,
            teamLogo: Array.isArray(awayRec.fields.teamLogo)
              ? awayRec.fields.teamLogo.map(img => ({ url: img.url, filename: img.filename }))
              : [],
            teamLogoURL: awayRec.fields.teamLogoURL || null,
          };
        } catch {}
      }
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
      // use packRecordId resolved above
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

      propsData = await Promise.all(propsRecords.map(async (record) => {
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
        // Resolve prop cover based on propCoverSource with graceful fallback
        // - "custom": prefer Props.propCover, fallback to Props.eventCover
        // - "event": prefer Props.eventCover, fallback to Props.propCover
        // - "hometeam": use home team logo (prefer prop-level event, fallback to pack-level)
        // - "awayteam": use away team logo (prefer prop-level event, fallback to pack-level)
        let propCover = [];
        const coverSource = String(f.propCoverSource || 'custom').toLowerCase();
        const hasEventCover = Array.isArray(f.eventCover) && f.eventCover.length > 0;
        const hasCustomCover = Array.isArray(f.propCover) && f.propCover.length > 0;
        // Determine team logos: prefer prop-level event logos first; fallback to pack-level event logos
        let homeLogoUrl = null;
        let awayLogoUrl = null;
        if (Array.isArray(f.Event) && f.Event.length > 0) {
          try {
            const ev = await base('Events').find(f.Event[0]);
            const evf = ev.fields || {};
            const hLink = evf.homeTeamLink;
            const aLink = evf.awayTeamLink;
            if (hLink) {
              const hid = Array.isArray(hLink) ? hLink[0] : hLink;
              try {
                const hRec = await base('Teams').find(hid);
                if (Array.isArray(hRec.fields.teamLogo) && hRec.fields.teamLogo.length > 0) {
                  homeLogoUrl = hRec.fields.teamLogo[0].url;
                } else if (hRec.fields.teamLogoURL) {
                  homeLogoUrl = hRec.fields.teamLogoURL;
                }
              } catch {}
            }
            if (aLink) {
              const aid = Array.isArray(aLink) ? aLink[0] : aLink;
              try {
                const aRec = await base('Teams').find(aid);
                if (Array.isArray(aRec.fields.teamLogo) && aRec.fields.teamLogo.length > 0) {
                  awayLogoUrl = aRec.fields.teamLogo[0].url;
                } else if (aRec.fields.teamLogoURL) {
                  awayLogoUrl = aRec.fields.teamLogoURL;
                }
              } catch {}
            }
          } catch {}
        }
        if (!homeLogoUrl) {
          if (Array.isArray(homeTeamInfoCover?.teamLogo) && homeTeamInfoCover.teamLogo[0]?.url) {
            homeLogoUrl = homeTeamInfoCover.teamLogo[0].url;
          } else if (homeTeamInfoCover?.teamLogoURL) {
            homeLogoUrl = homeTeamInfoCover.teamLogoURL;
          }
        }
        if (!awayLogoUrl) {
          if (Array.isArray(awayTeamInfoCover?.teamLogo) && awayTeamInfoCover.teamLogo[0]?.url) {
            awayLogoUrl = awayTeamInfoCover.teamLogo[0].url;
          } else if (awayTeamInfoCover?.teamLogoURL) {
            awayLogoUrl = awayTeamInfoCover.teamLogoURL;
          }
        }
        if (coverSource === 'hometeam' && homeLogoUrl) {
          propCover = [{ url: homeLogoUrl, filename: 'home-team-logo' }];
        } else if (coverSource === 'awayteam' && awayLogoUrl) {
          propCover = [{ url: awayLogoUrl, filename: 'away-team-logo' }];
        } else if (coverSource === 'event') {
          if (hasEventCover) {
            propCover = f.eventCover.map((img) => ({ url: img.url, filename: img.filename }));
          } else if (hasCustomCover) {
            propCover = f.propCover.map((img) => ({ url: img.url, filename: img.filename }));
          }
        } else {
          if (hasCustomCover) {
            propCover = f.propCover.map((img) => ({ url: img.url, filename: img.filename }));
          } else if (hasEventCover) {
            propCover = f.eventCover.map((img) => ({ url: img.url, filename: img.filename }));
          }
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
      }));
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
	let packEventId = null;
	let packEventIds = [];
	let homeTeam = null;
	let awayTeam = null;
	let homeTeamScore = null;
	let awayTeamScore = null;
	if (linkedEventIDs.length > 0) {
	  const firstEventID = linkedEventIDs[0];
	  packEventId = firstEventID;
	  packEventIds = linkedEventIDs;
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
		// Prefer explicit URL field first
		if (cf.contentImageURL && typeof cf.contentImageURL === 'string') {
		  contentImage = cf.contentImageURL;
		} else if (Array.isArray(cf.contentImage) && cf.contentImage.length > 0) {
		  // Fallback to first attachment URL
		  contentImage = cf.contentImage[0].url;
		}

		return {
		  airtableId: rec.id,
		  contentTitle: cf.contentTitle || "Untitled",
		  contentSource: cf.contentSource || "",
		  contentURL: cf.contentURL || "#",
		  spotify: cf.spotify || null,
		  apple: cf.apple || null,
		  youtube: cf.youtube || null,
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
	let packCreatorUsername = null;
	// Support either PackCreator or packCreator linked fields
	const creatorLinks = Array.isArray(packFields.PackCreator)
		? packFields.PackCreator
		: (Array.isArray(packFields.packCreator) ? packFields.packCreator : []);
	if (creatorLinks.length > 0) {
		const creatorRecordId = creatorLinks[0];
		const profileRecs = await base("Profiles")
			.select({
				filterByFormula: `RECORD_ID()='${creatorRecordId}'`,
				maxRecords: 1,
			})
			.firstPage();
		if (profileRecs.length > 0) {
			const pf = profileRecs[0].fields || {};
			packCreatorID = pf.profileID || profileRecs[0].id;
			packCreatorUsername = pf.profileUsername || null;
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
	  firstPlace: packFields.firstPlace || "",
	  packCreatorID,
	  packCreatorUsername,
	  packURL: packFields.packURL,
	  packOpenTime: packFields.packOpenTime || null,
	  packCloseTime: packFields.packCloseTime || null,
	  packEventId,
	  packEventIds,
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
