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

  // 2) Extract propID and propSide from request body
  const { propID, propSide } = req.body;
  if (!propID || !propSide) {
	return res.status(400).json({
	  success: false,
	  error: "Missing propID or propSide",
	});
  }

  try {
	// 3) Find the matching Prop record by propID
	const propsFound = await base("Props")
	  .select({
		filterByFormula: `{propID} = "${propID}"`,
		maxRecords: 1,
	  })
	  .firstPage();

	if (!propsFound.length) {
	  return res.status(404).json({
		success: false,
		error: `Prop not found for propID="${propID}"`,
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

	// 5) Overwrite any old "latest" take for this phone + prop
	const oldTakes = await base("Takes")
	  .select({
		filterByFormula: `AND({propID}="${propID}", {takeMobile}="${token.phone}", {takeStatus}="latest")`,
		maxRecords: 1,
	  })
	  .all();

	if (oldTakes.length > 0) {
	  const oldTake = oldTakes[0];
	  const oldSide = oldTake.fields.propSide;

	  // Mark old take as overwritten
	  await base("Takes").update([
		{
		  id: oldTake.id,
		  fields: { takeStatus: "overwritten" },
		},
	  ]);
	}

	// 6) Create the new "latest" take
	//    We'll link the "Profile" field to the user's profile record in Airtable
	const profileRecId = token.airtableId; // e.g., "rec123..."

	const takeResp = await base("Takes").create([
	  {
		fields: {
		  propID,
		  propSide,
		  takeMobile: token.phone,
		  takeStatus: "latest",
		  Prop: [propRec.id],    // link to the Prop record
		  Profile: [profileRecId], // link to the user's Profile record
		},
	  },
	]);
	const newTake = takeResp[0];
	const newTakeID = newTake.fields.takeID || newTake.id;

	// Compute dynamic side counts for this prop
	const takesRecords = await base("Takes")
	  .select({
		filterByFormula: `AND({propID}="${propID}", {takeStatus}!="overwritten")`,
		maxRecords: 10000,
	  })
	  .all();

	let sideACount = 0;
	let sideBCount = 0;
	takesRecords.forEach((take) => {
	  const side = take.fields.propSide;
	  if (side === "A") sideACount++;
	  if (side === "B") sideBCount++;
	});

	// Return success with updated dynamic counts
	return res.status(200).json({
	  success: true,
	  newTakeID,
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
