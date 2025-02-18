// File: /pages/api/activity.js

import Airtable from "airtable";

// Initialize Airtable
const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY })
  .base(process.env.AIRTABLE_BASE_ID);

export default async function handler(req, res) {
  if (req.method !== "POST") {
	console.log("[Activity API] Request method not allowed:", req.method);
	return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  // Extract the data from the request body
  const { profileID, packID, airtableId } = req.body;

  // Ensure all fields are provided
  if (!profileID || !packID || !airtableId) {
	console.log("[Activity API] Missing required fields:", { profileID, packID, airtableId });
	return res.status(400).json({
	  success: false,
	  error: "Missing required fields",
	});
  }

  console.log("[Activity API] Received request:", { profileID, packID, airtableId });
  console.log("[Activity API] We already have the Airtable Profile record ID, so no lookup needed.");

  try {
	// Create the new Activity record directly using the existing Airtable record ID
	console.log("[Activity API] Creating new Activity row in Airtable...");
	const newActivity = await base("Activity").create([
	  {
		fields: {
		  activityTitle: `Pack Completed: ${packID}`,
		  activityType: "Pack Completion",
		  // Optionally store these as text
		  profileID: profileID,
		  packID: packID,
		  // Link to the Profile record using the native Airtable record ID
		  Profile: [airtableId],
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
