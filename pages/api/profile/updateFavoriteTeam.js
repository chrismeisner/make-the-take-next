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
  // - PG: teamId (UUID teams.id) or teamSlug (teams.team_slug)
  // - Airtable: selectedTeamRecordId (Airtable record id)
  const { profileID, selectedTeamRecordId, teamId, teamSlug } = req.body;

  const backend = getDataBackend();

  try {
    if (backend === 'postgres') {
      // Resolve profile row id
      if (!currentUser?.userId && !currentUser?.profileID) {
        return res.status(401).json({ success: false, error: 'Not authenticated' });
      }
      // Resolve team id by either provided teamId or teamSlug
      let teamUuid = teamId || null;
      if (!teamUuid && teamSlug) {
        const { rows } = await query('SELECT id FROM teams WHERE team_slug = $1 LIMIT 1', [String(teamSlug)]);
        teamUuid = rows?.[0]?.id || null;
      }
      if (!teamUuid) {
        return res.status(400).json({ success: false, error: 'Missing teamId or teamSlug' });
      }
      // Update favorite_team_id by profile_id
      const { rows: profRows } = await query('SELECT id FROM profiles WHERE profile_id = $1 LIMIT 1', [currentUser.profileID]);
      if (!profRows?.length) {
        return res.status(404).json({ success: false, error: 'Profile not found' });
      }
      const profileRowId = profRows[0].id;
      await query('UPDATE profiles SET favorite_team_id = $1 WHERE id = $2', [teamUuid, profileRowId]);
      // Also upsert a team-level notification preference for pack_open
      await query(
        `INSERT INTO notification_preferences (profile_id, category, team_id, opted_in)
           VALUES ($1, $2, $3, TRUE)
         ON CONFLICT (profile_id, category, team_id)
           DO UPDATE SET opted_in = EXCLUDED.opted_in, updated_at = NOW()`,
        [profileRowId, 'pack_open', teamUuid]
      );
      return res.status(200).json({ success: true, profile: { id: profileRowId, favorite_team_id: teamUuid } });
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
