// pages/api/subjectIDs.js
import Airtable from 'airtable';

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);

export default async function handler(req, res) {
  try {
	// Fetch takes data from Airtable
	const takes = await base('Takes').select({ maxRecords: 5000 }).all();

	const subjectSet = new Set();
	takes.forEach((take) => {
	  const subjectID = take.fields.propSubjectID || [];
	  if (Array.isArray(subjectID)) {
		subjectID.forEach((id) => subjectSet.add(id));
	  } else {
		subjectSet.add(subjectID);
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
 