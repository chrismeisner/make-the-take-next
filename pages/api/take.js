// File: /pages/api/take.js
import { getToken } from "next-auth/jwt";
import Airtable from "airtable";

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY })
  .base(process.env.AIRTABLE_BASE_ID);

export default async function handler(req, res) {
  console.log("[/api/take] Received request with method:", req.method);

  // Only allow POST requests
  if (req.method !== "POST") {
	console.error("[/api/take] Invalid method:", req.method);
	return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  // 1) Validate the user's token (phone-based auth)
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  console.log("[/api/take] getToken returned:", token);

  if (!token || !token.phone) {
	console.error("[/api/take] No valid token found or phone missing. Unauthorized.");
	return res.status(401).json({ success: false, error: "Unauthorized" });
  }

  // 2) Extract propID & propSide
  const { propID, propSide } = req.body;
  console.log("[/api/take] Request body:", req.body);

  if (!propID || !propSide) {
	console.error("[/api/take] Missing propID or propSide in request.");
	return res.status(400).json({
	  success: false,
	  error: "Missing propID or propSide",
	});
  }

  console.log(
	"[/api/take] Proceeding with phone:",
	token.phone,
	"propID:",
	propID,
	"propSide:",
	propSide
  );

  try {
	// 3) Lookup the matching Prop record by propID
	const propsFound = await base("Props")
	  .select({
		filterByFormula: `{propID} = "${propID}"`,
		maxRecords: 1,
	  })
	  .firstPage();

	if (!propsFound.length) {
	  console.error("[/api/take] No Prop record found for propID:", propID);
	  return res.status(404).json({
		success: false,
		error: "Prop not found",
	  });
	}

	const propRec = propsFound[0];
	const propRecordId = propRec.id;
	const propStatus = propRec.fields.propStatus || "open";
	console.log("[/api/take] Found Prop =>", propRecordId, " status =", propStatus);

	// Ensure the Prop is open
	if (propStatus !== "open") {
	  console.error("[/api/take] Prop is not open. Status:", propStatus);
	  return res.status(400).json({
		success: false,
		error: `Prop is ${propStatus}, not open.`,
	  });
	}

	// 4) Lookup the matching Profile record by phone
	//    (profileMobile = token.phone)
	const profilesFound = await base("Profiles")
	  .select({
		filterByFormula: `{profileMobile} = "${token.phone}"`,
		maxRecords: 1,
	  })
	  .firstPage();

	let profileRecordId = null;
	if (profilesFound.length > 0) {
	  profileRecordId = profilesFound[0].id;
	  console.log("[/api/take] Found Profile =>", profileRecordId);
	} else {
	  console.warn("[/api/take] Could not find any Profile with phone =", token.phone);
	  // If you want to create a new Profile instead, do so here, or else skip linking
	}

	// 5) Overwrite old "latest" takes for this prop + phone
	const oldTakes = await base("Takes")
	  .select({
		filterByFormula: `AND({propID}="${propID}", {takeMobile}="${token.phone}")`,
		maxRecords: 5000,
	  })
	  .all();

	if (oldTakes.length > 0) {
	  console.log("[/api/take] Overwriting older takes =>", oldTakes.length);
	  const updates = oldTakes.map((rec) => ({
		id: rec.id,
		fields: { takeStatus: "overwritten" },
	  }));
	  await base("Takes").update(updates);
	}

	// 6) Create new "latest" take, linking to the Prop record + Profile (if found)
	console.log("[/api/take] Creating new take => linked Prop:", propRecordId);
	if (profileRecordId) {
	  console.log("[/api/take] Linking Profile:", profileRecordId);
	}
	const fieldsToCreate = {
	  propID,
	  propSide,
	  takeMobile: token.phone,
	  takeStatus: "latest",
	  Prop: [propRecordId], // Link the prop
	};

	if (profileRecordId) {
	  fieldsToCreate.Profile = [profileRecordId]; // Link the profile
	}

	const createResp = await base("Takes").create([
	  {
		fields: fieldsToCreate,
	  },
	]);

	const newTake = createResp[0];
	const newTakeID = newTake.id;
	console.log("[/api/take] New Take created =>", newTakeID);

	// 7) Recount side A / side B
	const activeTakes = await base("Takes")
	  .select({
		filterByFormula: `AND({propID}="${propID}", {takeStatus} != "overwritten")`,
		maxRecords: 5000,
	  })
	  .all();

	let sideACount = 0;
	let sideBCount = 0;
	for (const t of activeTakes) {
	  if (t.fields.propSide === "A") sideACount++;
	  if (t.fields.propSide === "B") sideBCount++;
	}
	console.log("[/api/take] Final count => sideA:", sideACount, " sideB:", sideBCount);

	// 8) Compute offset-based popularity, update the Prop record
	const aWithOffset = sideACount + 1;
	const bWithOffset = sideBCount + 1;
	const total = aWithOffset + bWithOffset;
	const propSideAPER = Math.round((aWithOffset / total) * 100);
	const propSideBPER = Math.round((bWithOffset / total) * 100);

	console.log("[/api/take] Updating Prop side A%:", propSideAPER, " B%:", propSideBPER);
	await base("Props").update([
	  {
		id: propRecordId,
		fields: {
		  PropSideAPER: propSideAPER,
		  PropSideBPER: propSideBPER,
		},
	  },
	]);

	// 9) Return success plus the new side counts
	return res.status(200).json({
	  success: true,
	  newTakeID,
	  sideACount,
	  sideBCount,
	});
  } catch (err) {
	console.error("[/api/take] Exception occurred:", err);
	return res.status(500).json({
	  success: false,
	  error: err.message || "Error creating take",
	});
  }
}
