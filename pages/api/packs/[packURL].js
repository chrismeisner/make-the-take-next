// File: /pages/api/packs/[packURL].js

import Airtable from "airtable";
import { createRepositories } from '../../../lib/dal/factory';
import { aggregateTakeStats } from '../../../lib/leaderboard';
import { getDataBackend } from '../../../lib/runtimeConfig';
import { query } from '../../../lib/db/postgres';
import { AirtablePacksRepository } from '../../../lib/dal/airtable/packs';
import { PostgresPacksRepository } from '../../../lib/dal/postgres/packs';
import { AirtablePropsRepository } from '../../../lib/dal/airtable/props';
import { PostgresPropsRepository } from '../../../lib/dal/postgres/props';

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

	const isPG = getDataBackend() === 'postgres';
  // Fetch linked Event record early so we can attach espnGameID and eventLeague to props
  const eventIDs = packFields.Event || [];
  let espnGameID = null;
  let eventLeague = null;
  // New: home/away team logos available early for prop cover resolution
  let homeTeamInfoCover = null;
  let awayTeamInfoCover = null;
  let packEventTime = null;
  let packEventId = null;
  let packEventIds = [];
  let homeTeam = null;
  let awayTeam = null;
  let homeTeamScore = null;
  let awayTeamScore = null;

  if (eventIDs.length > 0) {
    const firstEventID = eventIDs[0];
    packEventId = firstEventID;
    packEventIds = eventIDs;

    try {
      const { events } = createRepositories();
      const ev = await events.getById(firstEventID);
      if (ev) {
        espnGameID = ev.espnGameID || null;
        eventLeague = ev.eventLeague || null;
        packEventTime = ev.eventTime || null;
        // surface PG event fields in a consistent shape used elsewhere
        if (!ev.eventTitle && ev.title) ev.eventTitle = ev.title;
        if (!ev.eventCover && ev.eventCoverURL) ev.eventCover = [{ url: ev.eventCoverURL }];
        // For Postgres adapter, home/away logos are provided directly
        if (ev.homeTeamLogo || ev.awayTeamLogo) {
          homeTeamInfoCover = ev.homeTeamLogo ? { recordId: null, teamLogo: [{ url: ev.homeTeamLogo, filename: 'home-team-logo' }], teamLogoURL: ev.homeTeamLogo } : null;
          awayTeamInfoCover = ev.awayTeamLogo ? { recordId: null, teamLogo: [{ url: ev.awayTeamLogo, filename: 'away-team-logo' }], teamLogoURL: ev.awayTeamLogo } : null;
        } else {
          // Airtable adapter: fetch team logos from linked records if available
          const homeLink = ev.homeTeamLink || null;
          const awayLink = ev.awayTeamLink || null;
          homeTeam = homeLink || null;
          awayTeam = awayLink || null;
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
        }
      }
    } catch (err) {
      console.error(`[api/packs/[packURL]] Event lookup error =>`, err);
    }
  }
	// ---------------------------------------------
	// 2. Fetch linked Props via DAL and compute per-pack order
	// ---------------------------------------------
	let propsData = [];
	try {
	  const { props: propsRepo } = createRepositories();
	  const propsRecords = await propsRepo.listByPackURL(packURL);
	  console.log("[packURL] propsRecords length =>", propsRecords.length);
	  const getPerPackOrder = (p) => {
		try {
		  const raw = p.propOrderByPack;
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
		const po = typeof p.propOrder === 'number' ? p.propOrder : 0;
		return po;
	  };
	  propsRecords.sort((a, b) => getPerPackOrder(a) - getPerPackOrder(b));

	  propsData = await Promise.all(propsRecords.map(async (p) => {
		const f = p;
		console.log(`[api/packs/[packURL]] Building prop ${p.id}: espnGameID=${espnGameID}, eventLeague=${eventLeague}`);
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
		// When using Postgres, map props.cover_url into the attachment-like shape
		if (isPG && f.cover_url && typeof f.cover_url === 'string') {
		  propCover = [{ url: f.cover_url, filename: 'cover' }];
		}
		const coverSource = String(f.propCoverSource || 'custom').toLowerCase();
		const hasEventCover = Array.isArray(f.eventCover) && f.eventCover.length > 0;
		const hasCustomCover = Array.isArray(f.propCover) && f.propCover.length > 0;
		// Determine team logos: prefer prop-level event logos first; fallback to pack-level event logos
		let homeLogoUrl = null;
		let awayLogoUrl = null;
		if (!isPG && Array.isArray(f.Event) && f.Event.length > 0) {
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

		// Final PG fallback: if still empty, try using pack-level event cover or team logos
		if (isPG && (!Array.isArray(propCover) || propCover.length === 0)) {
		  // Prefer event cover if surfaced
		  if (Array.isArray(packFields.packCover) && packFields.packCover.length > 0) {
			// packFields.packCover is already an attachment-like array
			propCover = [{ url: packFields.packCover[0].url, filename: packFields.packCover[0].filename || 'pack-cover' }];
		  } else if (homeLogoUrl) {
			propCover = [{ url: homeLogoUrl, filename: 'home-team-logo' }];
		  } else if (awayLogoUrl) {
			propCover = [{ url: awayLogoUrl, filename: 'away-team-logo' }];
		  } else if (Array.isArray(f.eventCover) && f.eventCover[0]?.url) {
			propCover = [{ url: f.eventCover[0].url, filename: f.eventCover[0].filename || 'event-cover' }];
		  }
		}

		return {
		  airtableId: p.id,
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
		  // Default to 'vegas' when numeric side values are present
		  propValueModel: f.propValueModel || ((f.propSideAValue != null || f.propSideBValue != null) ? 'vegas' : null),
		  propSideAValue: f.propSideAValue || null,
		  propSideBValue: f.propSideBValue || null,
		  contentImageUrls,
		  contentLinks,
		  propCover,
		  propOrder: f.propOrder || 0,
		  // new per-prop ESPN lookup fields (fallback to pack-level event in Postgres)
		  propESPNLookup: f.propESPNLookup || espnGameID || null,
		  propLeagueLookup: f.propLeagueLookup || eventLeague || null,
		  espnGameID,
		  eventLeague,
		  // Event time lookup on the prop record (fallback to pack-level event time)
		  propEventTimeLookup: f.propEventTimeLookup || packEventTime || null,
		  propEventTitleLookup: f.propEventTitleLookup || null,
		  propEventMatchup: f.propEventMatchup || null,
		};
	  }));
	} catch (e) {
	  console.error("[packURL] Error loading props via DAL:", e);
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
	// 4c. Linked Contests => via DAL when Postgres, fallback to Airtable
	// ---------------------------------------------
	let contestsData = [];
	try {
	  const { contests } = createRepositories();
	  const contestsViaDal = await contests.listByPackURL(packURL);
	  if (Array.isArray(contestsViaDal) && contestsViaDal.length > 0) {
		contestsData = contestsViaDal.map((c) => ({
		  airtableId: c.airtableId,
		  contestID: c.contestID,
		  contestTitle: c.contestTitle,
		  contestPrize: c.contestPrize || "",
		}));
	  }
	} catch (e) {
	  // fallback to Airtable if DAL backend doesn't support this yet
	  const linkedContestIDs = packFields.Contests || [];
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
			contestPrize: cf.contestPrize || "",
		  };
		});
	  }
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

	// Fetch all profiles to map phone -> profileID
	let phoneToProfileID = new Map();
	if (isPG) {
	  try {
		const { rows } = await query('SELECT mobile_e164, profile_id FROM profiles WHERE mobile_e164 IS NOT NULL AND profile_id IS NOT NULL');
		phoneToProfileID = new Map(rows.map(r => [r.mobile_e164, r.profile_id]));
	  } catch (err) {
		console.error('[packURL] PG profiles map failed, falling back to Airtable =>', err);
		const allProfiles = await base('Profiles').select({ maxRecords: 5000 }).all();
		allProfiles.forEach((profile) => {
		  const { profileMobile, profileID } = profile.fields;
		  if (profileMobile && profileID) {
			phoneToProfileID.set(profileMobile, profileID);
		  }
		});
	  }
	} else {
	  const allProfiles = await base('Profiles').select({ maxRecords: 5000 }).all();
	  allProfiles.forEach((profile) => {
		const { profileMobile, profileID } = profile.fields;
		if (profileMobile && profileID) {
		  phoneToProfileID.set(profileMobile, profileID);
		}
	  });
	}

	// ---------------------------------------------
	// 6. Build leaderboard
	// ---------------------------------------------
	let leaderboard = [];
	if (isPG) {
	  try {
		// Compute leaderboard from Postgres takes joined to this pack
		const { rows: takeRows } = await query(
		  `SELECT t.take_mobile, t.take_result, COALESCE(t.take_pts, 0) AS take_pts
		     FROM takes t
		     JOIN props p ON p.id = t.prop_id
		     JOIN packs k ON k.id = p.pack_id
		    WHERE t.take_status = 'latest'
		      AND k.pack_url = $1`,
		  [packURL]
		);
		// Convert to Airtable-like records for shared aggregator
		const pseudo = takeRows.map((r) => ({ fields: { takeMobile: r.take_mobile, takeResult: r.take_result || null, takePTS: Number(r.take_pts) || 0, takeStatus: 'latest' } }));
		const statsList = aggregateTakeStats(pseudo);
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
	  } catch (pgLbErr) {
		console.error('[packURL] PG leaderboard failed =>', pgLbErr);
		leaderboard = [];
	  }
	} else {
	  // Airtable path: use linked takes
	  const linkedTakesIds = packFields.Takes || [];
	  if (linkedTakesIds.length > 0) {
		const orFormula = `OR(${linkedTakesIds.map((id) => `RECORD_ID()="${id}"`).join(",")})`;
		const takesRecords = await base("Takes").select({
		  filterByFormula: orFormula,
		  maxRecords: 10000,
		}).all();
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
	}

	const toIso = (t) => (t ? new Date(t).toISOString() : null);
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
	  packOpenTime: toIso(packFields.packOpenTime) || null,
	  packCloseTime: toIso(packFields.packCloseTime) || null,
	  packEventId,
	  packEventIds,
	  props: propsData,
	  packPrize: packFields.packPrize || "",
	  packPrizeImage,
	  prizeSummary: packFields.prizeSummary || "",
	  packPrizeURL: packFields.packPrizeURL || "",
	  packCover,
	  eventTime: toIso(packEventTime) || null,
	  espnGameID,
	  eventLeague,
	  homeTeam: null,
	  awayTeam: null,
	  homeTeamScore,
	  awayTeamScore,
	  contentData,
	  contests: contestsData,
	};

	console.log("[packURL] final leaderboard =>", leaderboard);

	// Optional shadow read: compare with alternate backend and log differences
	try {
	  if (process.env.SHADOW_READS === '1') {
		const backend = getDataBackend();
		const altPacks = backend === 'postgres' ? new AirtablePacksRepository() : new PostgresPacksRepository();
		const altProps = backend === 'postgres' ? new AirtablePropsRepository() : new PostgresPropsRepository();
		const altPack = await altPacks.getByPackURL(packURL);
		if (altPack) {
		  const altPropsList = await altProps.listByPackURL(packURL);
		  const diffs = [];
		  if ((altPack.packTitle || altPack.title) !== packData.packTitle) diffs.push('packTitle');
		  if ((altPack.packLeague || altPack.league) !== packData.packLeague) diffs.push('packLeague');
		  const pgPropIds = new Set((propsData || []).map(p => p.propID).filter(Boolean));
		  const atPropIds = new Set((altPropsList || []).map(p => p.propID || p.prop_id).filter(Boolean));
		  const onlyPg = [...pgPropIds].filter(x => !atPropIds.has(x)).slice(0,10);
		  const onlyAt = [...atPropIds].filter(x => !pgPropIds.has(x)).slice(0,10);
		  if (onlyPg.length || onlyAt.length || pgPropIds.size !== atPropIds.size) {
			diffs.push('propIDs');
		  }
		  if (diffs.length) {
			console.warn(`[shadow /api/packs/:packURL] backend=${backend} packURL=${packURL} diffs=`, { diffs, onlyPg, onlyAt, pgCount: pgPropIds.size, atCount: atPropIds.size });
		  }
		}
	  }
	} catch (shadowErr) {
	  console.warn('[shadow /api/packs/:packURL] shadow compare failed =>', shadowErr?.message || shadowErr);
	}

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
