// File: /pages/api/packs/index.js
 
import Airtable from "airtable";
import { getToken } from "next-auth/jwt";
import { upsertEvent } from "../../../lib/airtableService";

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
    // only include packs with status 'active' or 'graded'
    selectOptions.filterByFormula = `OR({packStatus}='active', {packStatus}='graded')`;
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
	  eventTime: fields.eventTime || null,
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
        packCoverUrl,
        props,
      } = req.body;

      const fields = {};
      if (packTitle !== undefined) fields.packTitle = packTitle;
      if (packSummary !== undefined) fields.packSummary = packSummary;
      if (packURL !== undefined) fields.packURL = packURL;
      if (packType !== undefined) fields.packType = packType;
      if (packLeague !== undefined) fields.packLeague = packLeague;
      if (packStatus !== undefined) fields.packStatus = packStatus;
      if (packCoverUrl !== undefined && packCoverUrl) {
        fields.packCover = [{ url: packCoverUrl }];
      }
      if (Array.isArray(props)) {
        fields.Props = props;
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
      const { packTitle, packSummary, packURL, packType, packLeague, packStatus, event, eventId, teams, packCoverUrl, props } = req.body;
      if (!packTitle || !packURL) {
        return res.status(400).json({ success: false, error: "Missing required fields: packTitle and packURL" });
      }
      // Prepare fields for Airtable record
      const fields = { packTitle, packSummary, packURL, packType, packLeague, packStatus };
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
      }
      // Link selected Teams to this Pack
      if (Array.isArray(teams) && teams.length > 0) {
        fields.Teams = teams;
      }
      if (packCoverUrl) {
        // Attach cover image
        fields.packCover = [{ url: packCoverUrl }];
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
