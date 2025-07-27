// File: /pages/api/packs/index.js
 
import Airtable from "airtable";
import { getToken } from "next-auth/jwt";

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(
  process.env.AIRTABLE_BASE_ID
);

// Helper: Fetch all packs from Airtable and map to our data structure
async function fetchAllPacks() {
  const packRecords = await base("Packs")
    .select({
      maxRecords: 100,
      // only include packs with status 'active' or 'graded'
      filterByFormula: `OR({packStatus}='active', {packStatus}='graded')`
    })
    .all();

  const packsData = packRecords.map((record) => {
	const fields = record.fields;
	return {
	  airtableId: record.id,
	  packID: fields.packID || record.id,
	  packTitle: fields.packTitle || "Untitled Pack",
	  packURL: fields.packURL || "",
	  packCover: fields.packCover ? fields.packCover[0]?.url : null,
	  packPrize: fields.packPrize || "",
	  prizeSummary: fields.prizeSummary || "",
	  packSummary: fields.packSummary || "",
	  packType: fields.packType || "unknown",
	  packStatus: fields.packStatus || "Unknown",
	  eventTime: fields.eventTime || null,
	  createdAt: record._rawJson.createdTime,
	  propsCount: (fields.Props || []).length,
	};
  });
  return packsData;
}

// Helper: If user is logged in, attach userTakeCount for each pack.
async function attachUserTakeCount(packsData, token) {
  // 1. Fetch the user's latest takes and count directly via the 'Packs' link field
  const filterByFormula = `AND({takeMobile} = "${token.phone}", {takeStatus} = "latest")`;
  const userTakeRecords = await base("Takes")
    .select({ filterByFormula, maxRecords: 5000 })
    .all();

  // Count verified takes per pack
  const packIdToVerifiedCount = {};
  userTakeRecords.forEach((takeRec) => {
    const f = takeRec.fields;
    // only count takes with result "Won" or "Lost"
    if (f.takeResult !== "Won" && f.takeResult !== "Lost") return;
    (f.Packs || []).forEach((packRecId) => {
      packIdToVerifiedCount[packRecId] = (packIdToVerifiedCount[packRecId] || 0) + 1;
    });
  });

  // 2. Map counts onto the packs data
  return packsData.map((p) => ({
    ...p,
    verifiedTakesCount: packIdToVerifiedCount[p.airtableId] || 0,
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
    // Update packStatus for a specific pack
    const { packId, packStatus } = req.body;
    if (!packId || !packStatus) {
      return res.status(400).json({ success: false, error: "Missing packId or packStatus" });
    }
    try {
      const updated = await base("Packs").update([
        { id: packId, fields: { packStatus } }
      ]);
      return res.status(200).json({ success: true, record: updated[0] });
    } catch (error) {
      console.error("[api/packs PATCH] Error =>", error);
      return res.status(500).json({ success: false, error: "Failed to update packStatus" });
    }
  }
  if (req.method === "POST") {
    try {
      const { packTitle, packSummary, packURL, packType, event, eventId, teams, packCoverUrl } = req.body;
      if (!packTitle || !packURL) {
        return res.status(400).json({ success: false, error: "Missing required fields: packTitle and packURL" });
      }
      // Prepare fields for Airtable record
      const fields = { packTitle, packSummary, packURL, packType };
      // If client passed the full event object, upsert it into Events and link
      if (event && typeof event === 'object') {
        let eventRecordId;
        const espnGameID = event.id;
        // Try to find existing Airtable Event record by espnGameID
        const existing = await base('Events')
          .select({ filterByFormula: `{espnGameID}="${espnGameID}"`, maxRecords: 1 })
          .firstPage();
        if (existing.length) {
          eventRecordId = existing[0].id;
          // Optionally update core event fields
          await base('Events').update([{ id: eventRecordId, fields: {
            eventTime: event.eventTime,
            eventTitle: event.eventTitle
          }}]);
        } else {
          // Create a new Event record
          const [created] = await base('Events').create([{ fields: {
            espnGameID: espnGameID,
            eventTime: event.eventTime,
            eventTitle: event.eventTitle,
            homeTeam: event.homeTeam,
            awayTeam: event.awayTeam,
            homeTeamLink: event.homeTeamLink,
            awayTeamLink: event.awayTeamLink,
          }}]);
          eventRecordId = created.id;
        }
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
      return res.status(500).json({ success: false, error: "Failed to create pack." });
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

	let packsData = await fetchAllPacks();

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
