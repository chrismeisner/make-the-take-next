// File: /pages/api/packs/index.js
 
import Airtable from "airtable";
import { getToken } from "next-auth/jwt";

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(
  process.env.AIRTABLE_BASE_ID
);

// Helper: Fetch all packs from Airtable and map to our data structure
async function fetchAllPacks() {
  const packRecords = await base("Packs")
	.select({ maxRecords: 100 })
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
  // 1. Fetch all Props to map Prop IDs to their Pack IDs.
  const propsRecords = await base("Props").select({ maxRecords: 5000 }).all();
  const propIdToPackIds = {};
  propsRecords.forEach((propRec) => {
	const propFields = propRec.fields;
	const linkedPackIds = propFields.Packs || [];
	propIdToPackIds[propRec.id] = linkedPackIds;
  });

  // 2. Fetch the user's latest Takes.
  const filterByFormula = `AND({takeMobile} = "${token.phone}", {takeStatus} = "latest")`;
  const userTakeRecords = await base("Takes")
	.select({ filterByFormula, maxRecords: 5000 })
	.all();

  // 3. Aggregate counts: map pack record ID to number of takes.
  const packIdToUserTakeCount = {};
  userTakeRecords.forEach((takeRec) => {
	const takeFields = takeRec.fields;
	const propLinks = takeFields.Prop || [];
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

  return packsData.map((p) => {
	const recId = p.airtableId;
	const userCountForThisPack = packIdToUserTakeCount[recId] || 0;
	return { ...p, userTakeCount: userCountForThisPack };
  });
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
	return res
	  .status(405)
	  .json({ success: false, error: "Method not allowed" });
  }
  try {
	const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
	const userIsLoggedIn = !!token;

	let packsData = await fetchAllPacks();

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
