// File: /pages/api/packs/index.js
 
import Airtable from "airtable";
import { getToken } from "next-auth/jwt";
import { upsertEvent } from "../../../lib/airtableService";
import { getDataBackend } from "../../../lib/runtimeConfig";
import { query } from "../../../lib/db/postgres";

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(
  process.env.AIRTABLE_BASE_ID
);

// Helper: Fetch all packs from Airtable and map to our data structure
// If a view name is provided, we will use that Airtable view to drive filtering/sorting.
// Otherwise, default to active/graded filter.
async function fetchAllPacks(viewName) {
  const selectOptions = { maxRecords: 100 };
  if (viewName && typeof viewName === "string") {
    selectOptions.view = viewName;
  } else {
    // include active, graded, and coming-soon (case-insensitive)
    selectOptions.filterByFormula = `OR(LOWER({packStatus})='active', LOWER({packStatus})='graded', LOWER({packStatus})='coming-soon')`;
  }

  const packRecords = await base("Packs").select(selectOptions).all();

  const packsData = await Promise.all(packRecords.map(async (record) => {
	const fields = record.fields;
	let eventTitle = null;
	if (fields.Event?.length) {
	  try {
		const ev = await base("Events").find(fields.Event[0]);
		eventTitle = ev.fields.eventTitle;
	  } catch (err) {
		console.error("[api/packs] error fetching linked Event:", err);
	  }
	}
	return {
	  airtableId: record.id,
	  eventTitle,
	  propEventRollup: Array.isArray(fields.propEventRollup) ? fields.propEventRollup : [],
	  packID: fields.packID || record.id,
	  packTitle: fields.packTitle || "Untitled Pack",
	  packURL: fields.packURL || "",
	  packCover: fields.packCover ? fields.packCover[0]?.url : null,
	  packPrize: fields.packPrize || "",
	  prizeSummary: fields.prizeSummary || "",
	  packSummary: fields.packSummary || "",
	  packType: fields.packType || "unknown",
	  packLeague: fields.packLeague || null,
	  packStatus: fields.packStatus || "Unknown",
	  packOpenTime: fields.packOpenTime || null,
	  packCloseTime: fields.packCloseTime || null,
	  eventTime: fields.eventTime || null,
	  firstPlace: fields.firstPlace || "",
	  createdAt: record._rawJson.createdTime,
	  propsCount: (fields.Props || []).length,
      // Winner info (from Airtable): either lookup or derive from linked record id
      winnerProfileID: fields.winnerProfileID || null,
      packWinnerRecordIds: Array.isArray(fields.packWinner) ? fields.packWinner : [],
	};
  }));
  return packsData;
}

// Helper: If user is logged in, attach userTakeCount for each pack.
async function attachUserTakeCount(packsData, token) {
  // 1. Fetch all latest takes by this user
  const filterByFormula = `AND({takeMobile} = '${token.phone}', {takeStatus} = 'latest')`;
  const userTakeRecords = await base('Takes')
    .select({ filterByFormula, maxRecords: 5000 })
    .all();

  // Count user takes per pack via the 'packID' lookup field
  const packIdToUserCount = {};
  userTakeRecords.forEach((rec) => {
    const f = rec.fields;
    // 'packID' may be a string or an array if multiple
    const packIDs = Array.isArray(f.packID) ? f.packID : f.packID ? [f.packID] : [];
    packIDs.forEach((pid) => {
      packIdToUserCount[pid] = (packIdToUserCount[pid] || 0) + 1;
    });
  });

  // 2. Map counts onto the packs data
  return packsData.map((p) => ({
    ...p,
    userTakesCount: packIdToUserCount[p.packID] || 0,
  }));
}

// Helper: Attach total take count for each pack.
async function attachTotalTakeCount(packsData) {
  // Fetch all latest takes.
  const takeRecords = await base("Takes").select({
    filterByFormula: '{takeStatus}="latest"',
    maxRecords: 5000,
  }).all();

  const packIdToCount = {};
  takeRecords.forEach((takeRec) => {
    const packIDValue = takeRec.fields.packID;
    if (!packIDValue) return;
    if (Array.isArray(packIDValue)) {
      packIDValue.forEach((pid) => {
        packIdToCount[pid] = (packIdToCount[pid] || 0) + 1;
      });
    } else {
      packIdToCount[packIDValue] = (packIdToCount[packIDValue] || 0) + 1;
    }
  });

  return packsData.map((p) => ({
    ...p,
    takeCount: packIdToCount[p.packID] || 0,
  }));
}

export default async function handler(req, res) {
  // Postgres path for GET (staging/prod Postgres runtime)
  if (req.method === "GET" && getDataBackend() === 'postgres') {
    try {
      const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
      const userPhone = token?.phone || null;

      // Filter: active/graded/coming-soon (case-insensitive) if status present
      const { rows: packRows } = await query(
        `SELECT id, pack_url, title, prize, cover_url, league, created_at, pack_status
         FROM packs
         WHERE LOWER(COALESCE(pack_status, '')) IN ('active','graded','coming-soon')
            OR pack_status IS NULL
         ORDER BY created_at DESC NULLS LAST
         LIMIT 200`
      );

      const packIdToUrl = new Map(packRows.map(r => [r.id, r.pack_url]));

      // Total take counts per pack (latest only)
      const { rows: totalCounts } = await query(
        `SELECT pack_id, COUNT(*)::int AS c
           FROM takes
          WHERE take_status = 'latest'
          GROUP BY pack_id`
      );
      const totalMap = new Map(totalCounts.map(r => [r.pack_id, Number(r.c)]));

      // User-specific take counts per pack (if logged in)
      let userMap = new Map();
      if (userPhone) {
        const { rows } = await query(
          `SELECT pack_id, COUNT(*)::int AS c
             FROM takes
            WHERE take_status = 'latest' AND take_mobile = $1
            GROUP BY pack_id`,
          [userPhone]
        );
        userMap = new Map(rows.map(r => [r.pack_id, Number(r.c)]));
      }

      const packsData = packRows.map((r) => ({
        airtableId: r.id, // legacy field name kept for shape compatibility
        eventTitle: null,
        propEventRollup: [],
        packID: r.id, // no Airtable id in PG; expose internal id
        packTitle: r.title || "Untitled Pack",
        packURL: r.pack_url || "",
        packCover: r.cover_url || null,
        packPrize: r.prize || "",
        prizeSummary: "",
        packSummary: "",
        packType: "",
        packLeague: r.league || null,
        packStatus: r.pack_status || "",
        packOpenTime: null,
        packCloseTime: null,
        eventTime: null,
        firstPlace: "",
        createdAt: r.created_at || null,
        propsCount: 0,
        winnerProfileID: null,
        packWinnerRecordIds: [],
        takeCount: totalMap.get(r.id) || 0,
        userTakesCount: userMap.get(r.id) || 0,
      }));

      return res.status(200).json({ success: true, packs: packsData });
    } catch (error) {
      console.error("[api/packs PG] Error =>", error);
      return res.status(500).json({ success: false, error: "Failed to fetch packs." });
    }
  }

  if (req.method === "DELETE") {
    try {
      const packId = req.query.packId || req.body?.packId;
      if (!packId || typeof packId !== 'string' || !packId.startsWith('rec')) {
        return res.status(400).json({ success: false, error: 'Missing or invalid packId' });
      }
      const deleted = await base('Packs').destroy([packId]);
      return res.status(200).json({ success: true, deleted: deleted?.[0]?.id || packId });
    } catch (error) {
      console.error('[api/packs DELETE] Error =>', error);
      const msg = error.message || 'Failed to delete pack';
      return res.status(500).json({ success: false, error: msg });
    }
  }
  if (req.method === "PATCH") {
    // Update pack fields
    const { packId } = req.body;
    if (!packId) {
      return res.status(400).json({ success: false, error: "Missing packId" });
    }
    try {
      const {
        packTitle,
        packSummary,
        packURL,
        packType,
        packLeague,
        packStatus,
        packOpenTime,
        packCloseTime,
        packCoverUrl,
        props,
        events,
      } = req.body;

      const fields = {};
      if (packTitle !== undefined) fields.packTitle = packTitle;
      if (packSummary !== undefined) fields.packSummary = packSummary;
      if (packURL !== undefined) fields.packURL = packURL;
      if (packType !== undefined) fields.packType = packType;
      if (packLeague !== undefined) fields.packLeague = packLeague;
      if (packStatus !== undefined) fields.packStatus = packStatus;
      if (packOpenTime !== undefined) fields.packOpenTime = packOpenTime;
      if (packCloseTime !== undefined) fields.packCloseTime = packCloseTime;
      if (packCoverUrl !== undefined && packCoverUrl) {
        fields.packCover = [{ url: packCoverUrl }];
      }
      if (Array.isArray(props)) {
        fields.Props = props;
      }
      if (Array.isArray(events)) {
        // Expect array of Airtable record IDs
        fields.Event = events;
      }

      if (Object.keys(fields).length === 0) {
        return res.status(400).json({ success: false, error: "No updatable fields provided" });
      }

      const updated = await base("Packs").update([
        { id: packId, fields }
      ], { typecast: true });
      return res.status(200).json({ success: true, record: updated[0] });
    } catch (error) {
      console.error("[api/packs PATCH] Error =>", error);
      const msg = error.message || "Failed to update pack";
      return res.status(500).json({ success: false, error: msg });
    }
  }
  if (req.method === "POST") {
    try {
      const { packTitle, packSummary, packURL, packType, packLeague, packStatus, packOpenTime, packCloseTime, event, eventId, events, teams, packCoverUrl, props, packCreator, firstPlace } = req.body;
      if (!packTitle || !packURL) {
        return res.status(400).json({ success: false, error: "Missing required fields: packTitle and packURL" });
      }
      // Prepare fields for Airtable record
      const fields = { packTitle, packSummary, packURL, packType, packLeague, packStatus };
      if (firstPlace !== undefined) fields.firstPlace = firstPlace;
      if (packOpenTime) fields.packOpenTime = packOpenTime;
      if (packCloseTime) fields.packCloseTime = packCloseTime;
      // Link selected Props to this Pack
      if (Array.isArray(props) && props.length > 0) {
        fields.Props = props;
      }
      // If client passed the full event object, upsert it into Events and link
      if (event && typeof event === 'object') {
        const eventRecordId = await upsertEvent(event);
        fields.Event = [eventRecordId];
      } else if (eventId && eventId.startsWith('rec')) {
        // Legacy: link to an existing Airtable Event record
        fields.Event = [eventId];
      } else if (Array.isArray(events) && events.length > 0) {
        // Multiple existing Event record IDs
        fields.Event = events;
      }
      // Link selected Teams to this Pack
      if (Array.isArray(teams) && teams.length > 0) {
        fields.Teams = teams;
      }
      if (packCoverUrl) {
        // Attach cover image
        fields.packCover = [{ url: packCoverUrl }];
      }
      // Link selected Pack Creator (linked record to Profiles)
      if (Array.isArray(packCreator) && packCreator.length > 0) {
        fields.packCreator = packCreator;
      }
      const created = await base("Packs").create([{ fields }]);
      const record = created[0];
      return res.status(200).json({ success: true, record });
    } catch (error) {
      console.error("[api/packs POST] Error =>", error);
      // Return the underlying error message if available
      const msg = error.message || "Failed to create pack.";
      return res.status(500).json({ success: false, error: msg });
    }
  }
  if (req.method !== "GET") {
	return res
	  .status(405)
	  .json({ success: false, error: "Method not allowed" });
  }
  try {
	const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
	const userIsLoggedIn = !!token;

	// Optional: allow clients to specify an Airtable view name for fetching packs
	const { view } = req.query;

	let packsData = await fetchAllPacks(view);

	// Attach total take count for each pack.
	packsData = await attachTotalTakeCount(packsData);

	if (userIsLoggedIn) {
	  packsData = await attachUserTakeCount(packsData, token);
	}

	return res.status(200).json({ success: true, packs: packsData });
  } catch (error) {
	console.error("[api/packs] Error =>", error);
	return res
	  .status(500)
	  .json({ success: false, error: "Failed to fetch packs." });
  }
}
