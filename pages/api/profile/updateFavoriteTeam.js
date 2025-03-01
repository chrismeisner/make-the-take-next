// pages/api/profile/updateFavoriteTeam.js

import Airtable from "airtable";

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY })
  .base(process.env.AIRTABLE_BASE_ID);

export default async function handler(req, res) {
  if (req.method !== "POST") {
	return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  // Expect the Profiles table's "profileID" (e.g., "user123") and the selected team's Airtable record id.
  const { profileID, selectedTeamRecordId } = req.body;

  if (!profileID || !selectedTeamRecordId) {
	return res.status(400).json({ success: false, error: "Missing required fields" });
  }

  try {
	// Query the Profiles table for the record where the field "profileID" matches the provided value.
	const records = await base("Profiles")
	  .select({
		filterByFormula: `{profileID} = '${profileID}'`,
		maxRecords: 1,
	  })
	  .firstPage();

	if (records.length === 0) {
	  return res.status(404).json({ success: false, error: "Profile not found" });
	}

	const recordId = records[0].id;

	// Update the "favoriteTeam" linked record field with an array containing the selected team's record id.
	const updatedRecords = await base("Profiles").update([
	  {
		id: recordId,
		fields: {
		  favoriteTeam: [selectedTeamRecordId],
		},
	  },
	]);

	return res.status(200).json({ success: true, profile: updatedRecords });
  } catch (error) {
	console.error("Error updating profile:", error);
	return res.status(500).json({ success: false, error: "Server error updating profile" });
  }
}
