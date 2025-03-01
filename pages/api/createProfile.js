import Airtable from "airtable";

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY })
  .base(process.env.AIRTABLE_BASE_ID);

// Helper function to normalize phone numbers to E.164 format.
const normalizePhone = (phoneStr) => {
  const numeric = phoneStr.replace(/\D/g, "");
  if (numeric.length === 10) {
	return `+1${numeric}`;
  } else if (numeric.length === 11 && numeric.startsWith("1")) {
	return `+${numeric}`;
  }
  return phoneStr; // fallback if unexpected format
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
	return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  let { phone, team } = req.body;

  if (!phone) {
	return res.status(400).json({ success: false, error: "Missing phone" });
  }

  // Normalize the phone number.
  const normalizedPhone = normalizePhone(phone);
  console.log("[createProfile] Normalized phone:", normalizedPhone);

  try {
	let teamRecordId = null;
	if (team) {
	  console.log("[createProfile] Querying Teams table for team with teamID =", team);
	  const teamRecords = await base("Teams")
		.select({
		  filterByFormula: `{teamID} = "${team}"`,
		  maxRecords: 1,
		})
		.firstPage();
	  if (teamRecords.length === 0) {
		console.error("[createProfile] Team not found for teamID:", team);
		return res.status(404).json({
		  success: false,
		  error: `Team with identifier "${team}" not found`,
		});
	  }
	  teamRecordId = teamRecords[0].id;
	  console.log("[createProfile] Found team record id:", teamRecordId);
	}

	console.log("[createProfile] Looking up existing profile with mobile:", normalizedPhone);
	const profileRecords = await base("Profiles")
	  .select({
		filterByFormula: `{profileMobile} = "${normalizedPhone}"`,
		maxRecords: 1,
	  })
	  .firstPage();

	const fieldsToUpdate = { profileMobile: normalizedPhone };
	if (teamRecordId) {
	  fieldsToUpdate.profileTeam = [teamRecordId];
	}

	if (profileRecords.length > 0) {
	  // Profile exists; update it.
	  const record = profileRecords[0];
	  console.log("[createProfile] Existing profile found, updating profile with id:", record.id);
	  const updatedRecords = await base("Profiles").update([
		{
		  id: record.id,
		  fields: fieldsToUpdate,
		},
	  ]);
	  console.log("[createProfile] Profile updated:", updatedRecords[0].fields);
	  return res.status(200).json({
		success: true,
		message: "Profile updated",
		profile: updatedRecords[0].fields,
	  });
	} else {
	  // No profile exists; create a new one.
	  console.log("[createProfile] No profile found; creating new profile");
	  const createdRecords = await base("Profiles").create([
		{
		  fields: fieldsToUpdate,
		},
	  ]);
	  console.log("[createProfile] Profile created:", createdRecords[0].fields);
	  return res.status(200).json({
		success: true,
		message: "Profile created",
		profile: createdRecords[0].fields,
	  });
	}
  } catch (err) {
	console.error("[createProfile] Error:", err);
	return res.status(500).json({ success: false, error: "Server error creating profile" });
  }
}
