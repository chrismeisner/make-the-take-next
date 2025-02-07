// pages/api/leaderboard.js
import Airtable from 'airtable';

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);

export default async function handler(req, res) {
  const { subjectID } = req.query;

  try {
	// Fetch profiles and takes data from Airtable
	const allProfiles = await base('Profiles').select({ maxRecords: 5000 }).all();
	const phoneToProfileID = new Map();
	allProfiles.forEach((profile) => {
	  const { profileMobile, profileID } = profile.fields;
	  if (profileMobile && profileID) {
		phoneToProfileID.set(profileMobile, profileID);
	  }
	});

	let allTakes = await base('Takes').select({
	  maxRecords: 5000,
	  filterByFormula: '{takeStatus} != "overwritten"',
	}).all();

	// If a subjectID is provided, filter takes by subject
	if (subjectID) {
	  allTakes = allTakes.filter((take) => {
		const propSubj = take.fields.propSubjectID || [];
		return Array.isArray(propSubj) ? propSubj.includes(subjectID) : propSubj === subjectID;
	  });
	}

	// Aggregate takes count and points by phone number
	const phoneStats = new Map();
	allTakes.forEach((take) => {
	  const phone = take.fields.takeMobile || 'Unknown';
	  const points = take.fields.takePTS || 0;
	  const currentStats = phoneStats.get(phone) || { takes: 0, points: 0 };
	  currentStats.takes += 1;
	  currentStats.points += points;
	  phoneStats.set(phone, currentStats);
	});

	// Prepare leaderboard data
	const leaderboard = Array.from(phoneStats.entries())
	  .map(([phone, stats]) => ({
		phone,
		count: stats.takes,
		points: stats.points,
		profileID: phoneToProfileID.get(phone) || null,
	  }))
	  .sort((a, b) => b.points - a.points);

	res.status(200).json({ success: true, leaderboard });
  } catch (err) {
	console.error('[API /leaderboard] Error:', err);
	res.status(500).json({ success: false, error: 'Failed to fetch leaderboard' });
  }
}
