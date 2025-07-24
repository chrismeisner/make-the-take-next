//pages/api/packs/[packURL]/leaderboard.js  

import Airtable from 'airtable';

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY })
  .base(process.env.AIRTABLE_BASE_ID);

export default async function handler(req, res) {
  if (req.method !== 'GET') {
	return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { packURL } = req.query;
  if (!packURL) {
	return res.status(400).json({ success: false, error: 'Missing packURL' });
  }

  try {
	// 1) Find the pack record by packURL
	const packRecords = await base('Packs')
	  .select({
		filterByFormula: `{packURL} = "${packURL}"`,
		maxRecords: 1,
	  })
	  .all();

	if (packRecords.length === 0) {
	  return res
		.status(404)
		.json({ success: false, error: 'No pack found with that packURL' });
	}

	const packRecord = packRecords[0];

	// 2) Get the linked Takes from the pack record
	const linkedTakesIds = packRecord.fields.Takes || [];
	if (linkedTakesIds.length === 0) {
	  // Means no takes for this pack
	  return res.status(200).json({
		success: true,
		leaderboard: [],
		packTitle: packRecord.fields.packTitle || '',
	  });
	}

	// 3) Fetch all the take records by their record IDs
	const orFormula = `OR(${linkedTakesIds
	  .map((id) => `RECORD_ID()="${id}"`)
	  .join(',')})`;
	const takes = await base('Takes')
	  .select({
		filterByFormula: orFormula,
		maxRecords: 10000,
	  })
	  .all();

	// 4) Aggregate stats for each user phone or profile
	const phoneStats = new Map(); // key = phone, value = { takes, points, won, lost, pending }

	for (const take of takes) {
	  const tf = take.fields;
	  // Skip any takes for archived or draft props
	  const propStatus = tf.propStatus || 'open';
	  if (propStatus === 'archived' || propStatus === 'draft') {
		continue;
	  }
	  // Skip any "overwritten" takes
	  if (tf.takeStatus === 'overwritten') {
		continue;
	  }

	  const phone = tf.takeMobile || 'Unknown';
	  const points = tf.takePTS || 0;
	  const result = (tf.takeResult || '').trim().toLowerCase(); // Normalize result to lowercase
	  const profileLink = tf.Profile || [];
	  let profileID = null;

	  // If there's a linked profile, store that user’s unique ID if you want
	  if (profileLink.length > 0) {
		// If your Takes table stores profileID as well, you could use tf.profileID
		profileID = tf.profileID || null;
	  }

	  // Initialize stats for the phone if needed
	  if (!phoneStats.has(phone)) {
		phoneStats.set(phone, {
		  phone,
		  profileID,
		  takes: 0,
		  points: 0,
		  won: 0,
		  lost: 0,
		  pending: 0,
		  pushed: 0,
		});
	  }

	  const currentStats = phoneStats.get(phone);

	  // Update stats
	  currentStats.takes += 1;
	  currentStats.points += points;
	  if (result === 'won') {
		currentStats.won += 1;
	  } else if (result === 'lost') {
		currentStats.lost += 1;
	  } else if (result === 'pending') {
		currentStats.pending += 1;
	  } else if (result === 'pushed' || result === 'push') {
		currentStats.pushed += 1;
	  }

	  phoneStats.set(phone, currentStats);
	}

	// 5) Convert map to an array and sort by points descending
	const leaderboard = Array.from(phoneStats.values()).sort((a, b) => b.points - a.points);

	// Return success
	return res.status(200).json({
	  success: true,
	  leaderboard,
	  packTitle: packRecord.fields.packTitle || '',
	});
  } catch (error) {
	console.error('[Pack Leaderboard] Error:', error);
	return res.status(500).json({
	  success: false,
	  error: 'Failed to generate pack leaderboard',
	});
  }
}
