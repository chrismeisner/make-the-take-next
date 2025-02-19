// File: /pages/api/packs/index.js

import Airtable from "airtable";
import { getToken } from "next-auth/jwt";

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY })
  .base(process.env.AIRTABLE_BASE_ID);

export default async function handler(req, res) {
  if (req.method !== "GET") {
	return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  try {
	// 1) Check if user is logged in (using NextAuth)
	const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
	const userIsLoggedIn = !!token;

	console.log("[api/packs] userIsLoggedIn =>", userIsLoggedIn);
	if (userIsLoggedIn) {
	  console.log("[api/packs] token =>", token);
	  // token.phone or token.profileID might be relevant
	}

	// 2) Fetch all packs — no filterByFormula => includes "Completed", "Active", "Coming Up", etc.
	const packRecords = await base("Packs")
	  .select({
		// e.g. remove any filterByFormula that excluded "Completed":
		// filterByFormula: "OR({packStatus} = 'Active', {packStatus} = 'Coming Up')",
		maxRecords: 100,
	  })
	  .all();

	console.log("[api/packs] Fetched packRecords =>", packRecords.length);

	// 3) Build an array of basic pack data
	let packsData = packRecords.map((record) => {
	  const fields = record.fields;
	  return {
		airtableId: record.id, // "recPACKxyz"
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
		// If your Packs table links to Props in a "Props" field:
		propsCount: (fields.Props || []).length,
	  };
	});

	// 4) If user is NOT logged in, just return the packs now
	if (!userIsLoggedIn) {
	  console.log("[api/packs] No user logged in, returning packsData");
	  return res.status(200).json({ success: true, packs: packsData });
	}

	// 5) If user IS logged in, compute userTakeCount
	//    We'll search for "takeStatus" = "latest" (or "verified") Takes for this user's phone
	//    Adjust field names as needed (profileID vs. phone).

	// 5a) Fetch all Props so we can map them to their Packs
	const propsRecords = await base("Props").select({ maxRecords: 5000 }).all();
	console.log("[api/packs] propsRecords length =>", propsRecords.length);

	const propIdToPackIds = {};
	propsRecords.forEach((propRec) => {
	  const propFields = propRec.fields;
	  const linkedPackIds = propFields.Packs || []; // array of "recPackXYZ"
	  propIdToPackIds[propRec.id] = linkedPackIds;
	});

	// 5b) Fetch user’s Takes with "takeStatus" = "latest"
	const filterByFormula = `AND({takeMobile} = "${token.phone}", {takeStatus} = "latest")`;
	console.log("[api/packs] filterByFormula =>", filterByFormula);

	const userTakeRecords = await base("Takes")
	  .select({
		filterByFormula,
		maxRecords: 5000,
	  })
	  .all();

	console.log("[api/packs] userTakeRecords found =>", userTakeRecords.length);

	// 5c) Build a map of pack -> how many "latest" takes
	const packIdToUserTakeCount = {};
	userTakeRecords.forEach((takeRec) => {
	  const takeFields = takeRec.fields;
	  const propLinks = takeFields.Prop || []; // array of "recPropXYZ"
	  propLinks.forEach((propId) => {
		const packLinks = propIdToPackIds[propId] || [];
		packLinks.forEach((packRecId) => {
		  if (!packIdToUserTakeCount[packRecId]) {
			packIdToUserTakeCount[packRecId] = 0;
		  }
		  packIdToUserTakeCount[packRecId]++;
		});
	  });
	});

	console.log("[api/packs] packIdToUserTakeCount =>", packIdToUserTakeCount);

	// 5d) Attach userTakeCount to each pack
	packsData = packsData.map((p) => {
	  const recId = p.airtableId; // "recPackXYZ"
	  const userCountForThisPack = packIdToUserTakeCount[recId] || 0;
	  return {
		...p,
		userTakeCount: userCountForThisPack,
	  };
	});

	console.log("[api/packs] Final packsData =>", packsData);

	// 6) Return final data
	return res.status(200).json({
	  success: true,
	  packs: packsData,
	});
  } catch (error) {
	console.error("[api/packs] Error =>", error);
	return res.status(500).json({
	  success: false,
	  error: "Failed to fetch packs.",
	});
  }
}
