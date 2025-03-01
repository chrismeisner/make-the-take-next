import { getToken } from "next-auth/jwt";
import Airtable from "airtable";

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY })
  .base(process.env.AIRTABLE_BASE_ID);

export default async function handler(req, res) {
  console.log("🔔 [updateTeam] Received request with method:", req.method);
  if (req.method !== "POST") {
	console.error("❌ [updateTeam] Invalid method:", req.method);
	return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  // Get the user's token from the request.
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  console.log("🔍 [updateTeam] Token received:", token);

  if (!token || !token.phone) {
	console.error("❌ [updateTeam] Missing token or phone in token:", token);
	return res.status(401).json({ success: false, error: "Unauthorized" });
  }

  // Get the team value from the request body.
  const { team } = req.body || {};
  console.log("🔍 [updateTeam] Team from request body:", team);
  if (!team) {
	console.error("❌ [updateTeam] No team provided in request body");
	return res.status(400).json({ success: false, error: "No team provided" });
  }

  try {
	const phone = token.phone;
	console.log(`🔄 [updateTeam] Updating team for phone ${phone} to team "${team}"`);

	// 1) Look up the corresponding Team record in the Teams table by matching teamID.
	console.log("[updateTeam] Querying Teams table with filterByFormula using teamID =", team);
	const teamRecords = await base("Teams")
	  .select({
		filterByFormula: `{teamID} = "${team}"`,
		maxRecords: 1,
	  })
	  .all();
	console.log("[updateTeam] Team records returned:", teamRecords);

	if (teamRecords.length === 0) {
	  console.error(`[updateTeam] No team found for teamID: ${team}`);
	  return res.status(404).json({ success: false, error: "Team not found" });
	}
	const teamRecordId = teamRecords[0].id;
	console.log("[updateTeam] Found team record id:", teamRecordId);

	// 2) Look up the Profile record for the logged-in user by phone.
	console.log("[updateTeam] Querying Profiles table with filterByFormula using profileMobile =", phone);
	const profileRecords = await base("Profiles")
	  .select({
		filterByFormula: `{profileMobile} = "${phone}"`,
		maxRecords: 1,
	  })
	  .all();
	console.log("[updateTeam] Profile records returned:", profileRecords);

	if (profileRecords.length === 0) {
	  console.error(`[updateTeam] Profile not found for phone: ${phone}`);
	  return res.status(404).json({ success: false, error: "Profile not found" });
	}
	const profileRec = profileRecords[0];
	console.log("[updateTeam] Found profile record id:", profileRec.id);
	console.log("[updateTeam] Current profileTeam field value:", profileRec.fields.profileTeam);

	// 3) Update the profileTeam field with the new team record ID.
	console.log("[updateTeam] Updating profileTeam field to:", [teamRecordId]);
	const updatedRecords = await base("Profiles").update([
	  {
		id: profileRec.id,
		fields: {
		  profileTeam: [teamRecordId],
		},
	  },
	]);
	console.log("[updateTeam] Update call response:", updatedRecords);
	const updatedProfile = updatedRecords[0].fields;
	console.log("[updateTeam] Updated profileTeam field:", updatedProfile.profileTeam);

	return res.status(200).json({
	  success: true,
	  message: "Team updated",
	  profile: updatedProfile,
	});
  } catch (err) {
	console.error("[updateTeam] Exception during update:", err);
	return res.status(500).json({ success: false, error: "Server error updating team" });
  }
}
