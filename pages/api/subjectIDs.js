//pages/api/subjectIDs.js

import Airtable from 'airtable';

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);

export default async function handler(req, res) {
  try {
	// Fetch takes data from Airtable
	const takes = await base('Takes').select({ maxRecords: 5000 }).all();

	const subjectSet = new Set();
	takes.forEach((take) => {
	  // Expecting an array of subject IDs for each take's prop
	  const subjectIDs = take.fields.propSubjectID || [];
	  if (Array.isArray(subjectIDs)) {
		// Add all subject IDs to the set
		subjectIDs.forEach((id) => subjectSet.add(id));
	  } else {
		// In case it's a single subject ID
		subjectSet.add(subjectIDs);
	  }
	});

	// Convert the Set to an array and send it as response
	const subjectIDs = Array.from(subjectSet);
	res.status(200).json({ success: true, subjectIDs });
  } catch (err) {
	console.error('[API /subjectIDs] Error:', err);
	res.status(500).json({ success: false, error: 'Failed to fetch subject IDs' });
  }
}
