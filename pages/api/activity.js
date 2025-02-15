// File: /pages/api/activity.js
import Airtable from "airtable";

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY })
  .base(process.env.AIRTABLE_BASE_ID);

export default async function handler(req, res) {
  if (req.method !== "POST") {
	return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  const { profileID, packID } = req.body;

  if (!profileID || !packID) {
	return res.status(400).json({ success: false, error: "Missing fields" });
  }

  try {
	// Check if the activity already exists for this profile and pack
	const existingActivity = await base("Activity")
	  .select({
		filterByFormula: `{Profile} = '${profileID}' AND {packID} = '${packID}'`,
		maxRecords: 1,
	  })
	  .firstPage();

	if (existingActivity.length > 0) {
	  return res.status(200).json({ success: false, message: "Activity already logged" });
	}

	// Create a new activity record
	const activityRecord = await base("Activity").create({
	  activityTitle: `Completed Pack: ${packID}`,
	  activityType: "Pack Completion",
	  Profile: profileID,
	});

	return res.status(200).json({
	  success: true,
	  activity: activityRecord,
	});
  } catch (error) {
	console.error("Error logging activity:", error);
	return res.status(500).json({ success: false, error: "Internal server error" });
  }
}
