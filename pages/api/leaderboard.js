//pages/api/leaderboard.js

import Airtable from 'airtable';

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);

export default async function handler(req, res) {
  const { subjectID } = req.query;
 
  try {
	// Fetch profiles so we can map phone -> profileID
	const allProfiles = await base('Profiles').select({ maxRecords: 5000 }).all();
	const phoneToProfileID = new Map();
	allProfiles.forEach((profile) => {
	  const { profileMobile, profileID } = profile.fields;
	  if (profileMobile && profileID) {
		phoneToProfileID.set(profileMobile, profileID);
	  }
	});

	// Fetch Takes (excluding overwritten)
	let allTakes = await base('Takes').select({
	  maxRecords: 5000,
	  filterByFormula: '{takeStatus} != "overwritten"',
	}).all();

	// If a subjectID is provided, filter by subject
	if (subjectID) {
	  allTakes = allTakes.filter((take) => {
		const propSubj = take.fields.propSubjectID || [];
		return Array.isArray(propSubj) ? propSubj.includes(subjectID) : propSubj === subjectID;
	  });
	}

	// phoneStats will store data like:
	// {
	//   takes: <number>,
	//   points: <number>,
	//   won: <number>,
	//   lost: <number>
	// }
	const phoneStats = new Map();

	allTakes.forEach((take) => {
	  const phone = take.fields.takeMobile || 'Unknown';
	  const points = take.fields.takePTS || 0;
	  const result = take.fields.takeResult || ''; // "Won", "Lost", etc.

	  // If we don’t have a stats object yet, initialize
	  if (!phoneStats.has(phone)) {
		phoneStats.set(phone, { takes: 0, points: 0, won: 0, lost: 0 });
	  }

	  const currentStats = phoneStats.get(phone);

	  // increment their total # of takes
	  currentStats.takes += 1;
	  // add any points
	  currentStats.points += points;

	  // if takeResult is "Won" => increment won
	  // if "Lost" => increment lost
	  if (result === 'Won') {
		currentStats.won += 1;
	  } else if (result === 'Lost') {
		currentStats.lost += 1;
	  }

	  phoneStats.set(phone, currentStats);
	});

	// Build the final array
	const leaderboard = Array.from(phoneStats.entries())
	  .map(([phone, stats]) => ({
		phone,
		count: stats.takes,
		points: stats.points,
		profileID: phoneToProfileID.get(phone) || null,
		won: stats.won,
		lost: stats.lost,
	  }))
	  // Sort by points descending (or however you want)
	  .sort((a, b) => b.points - a.points);

	res.status(200).json({ success: true, leaderboard });
  } catch (err) {
	console.error('[API /leaderboard] Error:', err);
	res.status(500).json({ success: false, error: 'Failed to fetch leaderboard' });
  }
}
