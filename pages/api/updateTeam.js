// File: /pages/api/updateTeam.js
import { getToken } from "next-auth/jwt";
import Airtable from "airtable";

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY })
  .base(process.env.AIRTABLE_BASE_ID);

export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== "POST") {
	console.error("[updateTeam] Invalid method =>", req.method);
	return res
	  .status(405)
	  .json({ success: false, error: "Method not allowed" });
  }

  // Use getToken to get the user's token from the request
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  console.log("[updateTeam] token =>", token);

  if (!token || !token.phone) {
	console.error("[updateTeam] No valid token or phone found => Unauthorized");
	return res.status(401).json({ success: false, error: "Unauthorized" });
  }

  // Extract 'team' from request body – this is the team value like "suns", "lakers", or "pistons"
  const { team } = req.body || {};
  if (!team) {
	console.error("[updateTeam] No team provided in body");
	return res.status(400).json({ success: false, error: "No team provided" });
  }

  try {
	const phone = token.phone;
	console.log("[updateTeam] Updating team for phone =>", phone, "to =>", team);

	// 1) Look up the corresponding Team record in the Teams table by matching teamID
	const teamRecords = await base("Teams")
	  .select({
		filterByFormula: `{teamID} = "${team}"`,
		maxRecords: 1,
	  })
	  .all();

	if (teamRecords.length === 0) {
	  console.error("[updateTeam] Team not found for teamID:", team);
	  return res.status(404).json({ success: false, error: "Team not found" });
	}
	const teamRecordId = teamRecords[0].id;
	console.log("[updateTeam] Found Team record =>", teamRecordId);

	// 2) Find the Profile record for the logged-in user by phone
	const profileRecords = await base("Profiles")
	  .select({
		filterByFormula: `{profileMobile} = "${phone}"`,
		maxRecords: 1,
	  })
	  .all();

	if (profileRecords.length === 0) {
	  console.error("[updateTeam] Profile not found for phone =>", phone);
	  return res.status(404).json({ success: false, error: "Profile not found" });
	}
	const profileRec = profileRecords[0];
	console.log("[updateTeam] Found Profile =>", profileRec.id);

	// 3) Update the profileTeam field as a linked record
	// This sets the field to an array containing just the new team record id,
	// thereby overwriting any existing team link.
	await base("Profiles").update([
	  {
		id: profileRec.id,
		fields: {
		  profileTeam: [teamRecordId],
		},
	  },
	]);

	console.log("[updateTeam] Successfully updated team to", team);
	return res.status(200).json({ success: true, message: "Team updated" });

  } catch (err) {
	console.error("[updateTeam] Error =>", err);
	return res
	  .status(500)
	  .json({ success: false, error: "Server error updating team" });
  }
}
