// pages/api/profile/updateFavoriteTeam.js

import Airtable from "airtable";
import { getDataBackend } from "../../../lib/runtimeConfig";
import { getCurrentUser } from "../../../lib/auth";
import { query } from "../../../lib/db/postgres";

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY })
  .base(process.env.AIRTABLE_BASE_ID);

export default async function handler(req, res) {
  if (req.method !== "POST") {
	return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  const currentUser = await getCurrentUser(req);
  if (!currentUser) {
    return res.status(401).json({ success: false, error: "Not authenticated" });
  }

  // Expect either a team identifier appropriate for the backend
  // - PG: team_id (UUID) or id
  // - Airtable: selectedTeamRecordId (Airtable record id)
  const { profileID, selectedTeamRecordId, teamId } = req.body;

  const backend = getDataBackend();

  try {
    if (backend === 'postgres') {
      // No-op in PG mode until favorite_team_id is added to schema
      return res.status(200).json({ success: true, profile: {} });
    }

	// Airtable path: lookup by profileID and update favoriteTeam link
	if (!profileID || !selectedTeamRecordId) {
	  return res.status(400).json({ success: false, error: "Missing required fields" });
	}
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
	const updatedRecords = await base("Profiles").update([
	  {
		id: recordId,
		fields: { favoriteTeam: [selectedTeamRecordId] },
	  },
	]);
	return res.status(200).json({ success: true, profile: updatedRecords });
  } catch (error) {
	console.error("Error updating profile:", error);
	return res.status(500).json({ success: false, error: "Server error updating profile" });
  }
}
