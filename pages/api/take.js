// File: /pages/api/take.js

import { getToken } from "next-auth/jwt";
import Airtable from "airtable";

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY })
  .base(process.env.AIRTABLE_BASE_ID);

export default async function handler(req, res) {
  console.log("[/api/take] Received request with method:", req.method);

  if (req.method !== "POST") {
	return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  // 1) Validate user token
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token || !token.phone) {
	return res.status(401).json({ success: false, error: "Unauthorized" });
  }

  // 2) Extract propID and propSide
  const { propID, propSide } = req.body;
  if (!propID || !propSide) {
	return res.status(400).json({
	  success: false,
	  error: "Missing propID or propSide",
	});
  }

  try {
	// 3) Find the matching Prop record
	const propsFound = await base("Props").select({
	  filterByFormula: `{propID} = "${propID}"`,
	  maxRecords: 1,
	}).firstPage();

	if (!propsFound.length) {
	  return res.status(404).json({
		success: false,
		error: "Prop not found",
	  });
	}

	const propRec = propsFound[0];
	const propStatus = propRec.fields.propStatus || "open";
	if (propStatus !== "open") {
	  return res.status(400).json({
		success: false,
		error: `Prop is ${propStatus}, not open.`,
	  });
	}

	// 4) (Optional) Lookup Profile record by phone
	const profilesFound = await base("Profiles").select({
	  filterByFormula: `{profileMobile} = "${token.phone}"`,
	  maxRecords: 1,
	}).firstPage();

	let profileRecordId = null;
	if (profilesFound.length > 0) {
	  profileRecordId = profilesFound[0].id;
	}

	// 5) Overwrite older takes for this prop + phone
	const oldTakes = await base("Takes").select({
	  filterByFormula: `AND({propID}="${propID}", {takeMobile}="${token.phone}")`,
	  maxRecords: 5000,
	}).all();

	if (oldTakes.length > 0) {
	  const updates = oldTakes.map((rec) => ({
		id: rec.id,
		fields: { takeStatus: "overwritten" },
	  }));
	  await base("Takes").update(updates);
	}

	// 6) Create new "latest" take
	const fieldsToCreate = {
	  propID,
	  propSide,
	  takeMobile: token.phone,
	  takeStatus: "latest",
	  Prop: [propRec.id], // link to Prop record
	};
	if (profileRecordId) {
	  fieldsToCreate.Profile = [profileRecordId];
	}

	const createResp = await base("Takes").create([{ fields: fieldsToCreate }]);
	const newTake = createResp[0];

	// 7) Grab your custom "takeID" field (be sure it is populated in Airtable)
	const customTakeID = newTake.fields.takeID;

	// 8) Recount side A / B
	const activeTakes = await base("Takes").select({
	  filterByFormula: `AND({propID}="${propID}", {takeStatus} != "overwritten")`,
	  maxRecords: 5000,
	}).all();

	let sideACount = 0;
	let sideBCount = 0;
	for (const t of activeTakes) {
	  if (t.fields.propSide === "A") sideACount++;
	  if (t.fields.propSide === "B") sideBCount++;
	}

	// 9) Compute percentages and update the Prop record
	const aWithOffset = sideACount + 1;
	const bWithOffset = sideBCount + 1;
	const total = aWithOffset + bWithOffset;
	const propSideAPER = Math.round((aWithOffset / total) * 100);
	const propSideBPER = Math.round((bWithOffset / total) * 100);

	await base("Props").update([
	  {
		id: propRec.id,
		fields: {
		  PropSideAPER: propSideAPER,
		  PropSideBPER: propSideBPER,
		},
	  },
	]);

	// 10) Return only the custom takeID
	return res.status(200).json({
	  success: true,
	  newTakeID: customTakeID,
	  sideACount,
	  sideBCount,
	});

  } catch (err) {
	console.error("[/api/take] Exception:", err);
	return res.status(500).json({
	  success: false,
	  error: err.message || "Error creating take",
	});
  }
}
