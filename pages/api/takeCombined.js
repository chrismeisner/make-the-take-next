// pages/api/takeCombined.js
import twilio from "twilio";
import Airtable from "airtable";

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY })
  .base(process.env.AIRTABLE_BASE_ID);

export default async function handler(req, res) {
  if (req.method !== "POST") {
	return res.status(405).json({ success: false, error: "Method not allowed" });
  }
  const { phone, code, propID, propSide } = req.body;
  if (!phone || !code || !propID || !propSide) {
	return res.status(400).json({ success: false, error: "Missing fields" });
  }

  // Format phone to E.164
  const numeric = phone.replace(/\D/g, "");
  const e164Phone = `+1${numeric}`;

  try {
	// 1) Verify Twilio code
	const check = await client.verify.v2
	  .services(process.env.TWILIO_VERIFY_SERVICE_SID)
	  .verificationChecks.create({ to: e164Phone, code });
	if (check.status !== "approved") {
	  return res.status(401).json({ success: false, error: "Invalid verification code" });
	}

	// 2) Check if prop is open (optional)
	const propRecords = await base("Props")
	  .select({ filterByFormula: `{propID}="${propID}"`, maxRecords: 1 })
	  .firstPage();
	if (!propRecords.length) {
	  return res.status(404).json({ success: false, error: "Prop not found" });
	}
	const prop = propRecords[0].fields;
	// Collect linked teams from the Prop record
	const propRec = propRecords[0];
	const teams = Array.isArray(propRec.fields.Teams) ? propRec.fields.Teams : [];
	if (prop.propStatus !== "open") {
	  return res.status(400).json({ success: false, error: `Prop is ${prop.propStatus}, no new takes allowed.` });
	}

	// 3) Overwrite old takes from this phone, if you want only one “latest”
	const existingTakes = await base("Takes")
	  .select({
		filterByFormula: `AND({propID}="${propID}", {takeMobile}="${e164Phone}")`,
		maxRecords: 5000,
	  })
	  .all();
	if (existingTakes.length > 0) {
	  const updates = existingTakes.map((rec) => ({
		id: rec.id,
		fields: { takeStatus: "overwritten" },
	  }));
	  await base("Takes").update(updates);
	}

	// 4) Calculate popularity of the chosen side before adding the new take
	const popularityTakes = await base("Takes")
	  .select({ filterByFormula: `AND({propID}="${propID}", {takeStatus}!="overwritten")` })
	  .all();
	let popularityA = 0;
	let popularityB = 0;
	popularityTakes.forEach((t) => {
	  if (t.fields.propSide === "A") popularityA++;
	  if (t.fields.propSide === "B") popularityB++;
	});
	const totalCount = popularityA + popularityB;
	const chosenCount = propSide === "A" ? popularityA : popularityB;
	const takePopularity = totalCount > 0 ? chosenCount / totalCount : 0.5;

	// 4) Create new take
	const created = await base("Takes").create([
	  {
		fields: {
		  propID,
		  propSide,
		  takeMobile: e164Phone,
		  takeStatus: "latest",
		  takeLivePopularity: takePopularity,
		  // Link the same teams to the Take record
		  Teams: teams,
		},
	  },
	]);
	const newTakeID = created[0].id;

	// 5) Recount side A/B
	const allActiveTakes = await base("Takes")
	  .select({
		filterByFormula: `AND({propID}="${propID}", {takeStatus}!="overwritten")`,
	  })
	  .all();
	let sideACount = 0;
	let sideBCount = 0;
	allActiveTakes.forEach((t) => {
	  if (t.fields.propSide === "A") sideACount++;
	  if (t.fields.propSide === "B") sideBCount++;
	});

	return res.json({
	  success: true,
	  newTakeID,
	  sideACount,
	  sideBCount,
	});
  } catch (err) {
	console.error("[takeCombined] Error:", err);
	return res.status(500).json({ success: false, error: "Server error" });
  }
}
