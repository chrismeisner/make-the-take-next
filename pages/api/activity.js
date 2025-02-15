// File: /pages/api/activity.js
import Airtable from "airtable";

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);

export default async function handler(req, res) {
  if (req.method !== "POST") {
	return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  const { profileID, packID } = req.body;

  if (!profileID || !packID) {
	return res.status(400).json({
	  success: false,
	  error: "Missing profileID or packID",
	});
  }

  console.log("[Activity API] Received request:", { profileID, packID });

  try {
	// 1) Log a new activity record without checking for existing ones
	const newActivity = await base("Activity").create([
	  {
		fields: {
		  activityTitle: `Pack Completed: ${packID}`,
		  activityType: "Pack Completion",
		  profileID: profileID, // Store the profileID (as a text field)
		  packID: packID, // Store the pack ID
		},
	  },
	]);

	console.log("[Activity API] New activity record created:", newActivity);

	return res.status(200).json({
	  success: true,
	  activity: newActivity,
	});
  } catch (error) {
	console.error("[Activity API] Error logging activity:", error);
	return res.status(500).json({
	  success: false,
	  error: "Internal server error",
	});
  }
}
