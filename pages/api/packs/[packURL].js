// File: /pages/api/packs/[packURL].js

import { createRepositories } from '../../../lib/dal/factory';
import { aggregateTakeStats } from '../../../lib/leaderboard';
import { query } from '../../../lib/db/postgres';

// Airtable removed; Postgres-only

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
  // Postgres-only
  // Fetch linked Event record early so we can attach espnGameID and eventLeague to props
  // Load all linked events from join table; fallback to single event_id from pack
  let eventIDs = packFields.Event || [];
  try {
    const { rows: evRows } = await query(
      `SELECT pe.event_id
         FROM packs p
         LEFT JOIN packs_events pe ON pe.pack_id = p.id
        WHERE p.pack_url = $1`,
      [packURL]
    );
    const fromJoin = evRows.map(r => r.event_id).filter(Boolean);
    if (fromJoin.length > 0) {
      eventIDs = Array.from(new Set(fromJoin));
    } else if (!eventIDs.length && packRecordId) {
      // Fallback to pack.event_id
      try {
        const { rows } = await query('SELECT event_id FROM packs WHERE id = $1', [packRecordId]);
        const eid = rows?.[0]?.event_id || null;
        if (eid) eventIDs = [eid];
      } catch {}
    }
  } catch (e) {
    // keep default eventIDs
  }
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
  // Collect teams linked to this pack via events and props
  let linkedTeams = [];
  // Series list for this pack
  let seriesList = [];

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
        try {
          if (espnGameID && eventLeague) {
            const toPathLeague = (lg) => {
              const v = String(lg || '').toLowerCase();
              switch (v) {
                case 'mlb': return 'baseball/mlb';
                case 'nba': return 'basketball/nba';
                case 'nfl': return 'football/nfl';
                case 'nhl': return 'hockey/nhl';
                case 'ncaam': return 'basketball/mens-college-basketball';
                case 'ncaaw': return 'basketball/womens-college-basketball';
                case 'ncaaf': return 'football/college-football';
                default: return `baseball/${v}`;
              }
            };
            const pathLeague = toPathLeague(eventLeague);
            const localUrl = `/api/scores?league=${eventLeague}&event=${espnGameID}`;
            const espnSummary = `https://site.api.espn.com/apis/site/v2/sports/${pathLeague}/summary?event=${espnGameID}`;
            // eslint-disable-next-line no-console
            console.log(`[packURL] getting the espn id: ${espnGameID} (${eventLeague})`);
            // eslint-disable-next-line no-console
            console.log(`[packURL]  ↳ local: ${localUrl}`);
            // eslint-disable-next-line no-console
            console.log(`[packURL]  ↳ espn:  ${espnSummary}`);
          }
        } catch {}
        // surface PG event fields in a consistent shape used elsewhere
        if (!ev.eventTitle && ev.title) ev.eventTitle = ev.title;
        if (!ev.eventCover && ev.eventCoverURL) ev.eventCover = [{ url: ev.eventCoverURL }];
        // For Postgres adapter, home/away logos are provided directly
        if (ev.homeTeamLogo || ev.awayTeamLogo) {
          homeTeamInfoCover = ev.homeTeamLogo ? { recordId: null, teamLogo: [{ url: ev.homeTeamLogo, filename: 'home-team-logo' }], teamLogoURL: ev.homeTeamLogo } : null;
          awayTeamInfoCover = ev.awayTeamLogo ? { recordId: null, teamLogo: [{ url: ev.awayTeamLogo, filename: 'away-team-logo' }], teamLogoURL: ev.awayTeamLogo } : null;
        }
      }
    } catch (err) {
      console.error(`[api/packs/[packURL]] Event lookup error =>`, err);
    }
  }
  // Discover series that include this pack
  try {
    if (packRecordId) {
      const { rows } = await query(
        `SELECT s.id, s.series_id, s.title
           FROM series_packs spx
           JOIN series s ON s.id = spx.series_id
          WHERE spx.pack_id = $1
          ORDER BY s.created_at DESC NULLS LAST, s.title ASC NULLS LAST`,
        [packRecordId]
      );
      seriesList = (rows || []).map((r) => ({ id: r.id, series_id: r.series_id || null, title: r.title || 'Untitled Series' }));
    }
  } catch (e) {
    // non-fatal
    seriesList = [];
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
		// Prefer per-prop linked event for ESPN/league/time, then fallback to pack-level
		let perPropEvent = null;
		try {
		  const perPropEventId = Array.isArray(f.Event) && f.Event.length > 0 ? f.Event[0] : null;
		  if (perPropEventId) {
			const { events } = createRepositories();
			perPropEvent = await events.getById(perPropEventId);
		  }
		} catch (e) {
		  // non-fatal
		}
		const effectiveEspnId = (f.propESPNLookup || perPropEvent?.espnGameID || espnGameID) || null;
		const effectiveLeague = (f.propLeagueLookup || perPropEvent?.eventLeague || eventLeague) || null;
		const effectiveEventTime = (f.propEventTimeLookup || perPropEvent?.eventTime || packEventTime) || null;
		const effectiveEventTitle = f.propEventTitleLookup || perPropEvent?.eventTitle || null;
		console.log(`[api/packs/[packURL]] Building prop ${p.id}: espnGameID=${effectiveEspnId}, league=${effectiveLeague}`);
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
		if (f.cover_url && typeof f.cover_url === 'string') {
		  propCover = [{ url: f.cover_url, filename: 'cover' }];
		}
		const coverSource = String(f.propCoverSource || 'custom').toLowerCase();
		const hasEventCover = Array.isArray(f.eventCover) && f.eventCover.length > 0;
		const hasCustomCover = Array.isArray(f.propCover) && f.propCover.length > 0;
		// Determine team logos: prefer prop-level event logos first; fallback to pack-level event logos
		let homeLogoUrl = null;
		let awayLogoUrl = null;
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
		if (!Array.isArray(propCover) || propCover.length === 0) {
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
		  // Per-prop ESPN/league/time derived from linked event; fallback to pack-level
		  propESPNLookup: effectiveEspnId,
		  propLeagueLookup: effectiveLeague,
		  espnGameID: effectiveEspnId,
		  eventLeague: effectiveLeague,
		  // Event time lookup derived per-prop if available
		  propEventTimeLookup: effectiveEventTime,
		  propEventTitleLookup: effectiveEventTitle,
		  propEventMatchup: f.propEventMatchup || effectiveEventTitle || null,
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
	// 4b. Linked Content records => contentData (disabled without Airtable)
	// ---------------------------------------------
	let contentData = [];

	// ---------------------------------------------
	// 4c. Linked Contests => via DAL (Postgres-only)
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
	  // If DAL not available, leave contestsData empty
	}

	// ---------------------------------------------
	// 5. Consolidate pack data
	// ---------------------------------------------

    // Build linkedTeams from pack events and props
    try {
      if (packRecordId) {
        const { rows: teamRows } = await query(
          `WITH team_ids AS (
             SELECT e.home_team_id AS team_id
               FROM packs_events pe
               JOIN events e ON e.id = pe.event_id
              WHERE pe.pack_id = $1
             UNION
             SELECT e.away_team_id AS team_id
               FROM packs_events pe
               JOIN events e ON e.id = pe.event_id
              WHERE pe.pack_id = $1
             UNION
             SELECT e.home_team_id AS team_id
               FROM packs p
               JOIN events e ON e.id = p.event_id
              WHERE p.id = $1
             UNION
             SELECT e.away_team_id AS team_id
               FROM packs p
               JOIN events e ON e.id = p.event_id
              WHERE p.id = $1
             UNION
             SELECT pt.team_id AS team_id
               FROM props pr
               JOIN props_teams pt ON pt.prop_id = pr.id
              WHERE pr.pack_id = $1
           )
           SELECT DISTINCT t.team_slug, t.name, t.short_name, t.logo_url
             FROM team_ids ti
             JOIN teams t ON t.id = ti.team_id
            WHERE t.team_slug IS NOT NULL`,
          [packRecordId]
        );
        linkedTeams = (teamRows || []).map((r) => ({
          slug: r.team_slug,
          name: r.name,
          shortName: r.short_name || null,
          logoUrl: r.logo_url || null,
        }));
      }
    } catch (e) {
      // Non-fatal if team discovery fails
      // eslint-disable-next-line no-console
      console.warn('[api/packs/[packURL]] linkedTeams lookup failed =>', e?.message || e);
      linkedTeams = [];
    }
	// Additional pack detail fields
	const packCreatorID = null;
	const packCreatorUsername = null;

	// Fetch all profiles to map phone -> profileID
	let phoneToProfileID = new Map();
	try {
	  const { rows } = await query('SELECT mobile_e164, profile_id FROM profiles WHERE mobile_e164 IS NOT NULL AND profile_id IS NOT NULL');
	  phoneToProfileID = new Map(rows.map(r => [r.mobile_e164, r.profile_id]));
	} catch (err) {
	  console.error('[packURL] PG profiles map failed =>', err);
	}

	// ---------------------------------------------
	// 6. Build leaderboard
	// ---------------------------------------------
	let leaderboard = [];
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

  const toIso = (t) => (t ? new Date(t).toISOString() : null);
  const packData = {
    packID: packFields.packID,
    packTitle: packFields.packTitle || "Untitled Pack",
    packSummary: packFields.packSummary || "",
    packStatus: packFields.packStatus || "",
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
    linkedTeams,
    seriesList,
  };

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
