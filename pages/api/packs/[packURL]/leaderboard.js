//pages/api/packs/[packURL]/leaderboard.js  

import Airtable from 'airtable';
import { aggregateTakeStats } from '../../../../lib/leaderboard';

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

	// Build phone->profileID map
	const phoneToProfileID = new Map();
	takes.forEach((take) => {
	  const tf = take.fields;
	  const profileLink = tf.Profile || [];
	  if (profileLink.length > 0 && tf.profileID) {
		const phoneKey = tf.takeMobile || 'Unknown';
		phoneToProfileID.set(phoneKey, tf.profileID);
	  }
	});

	// Aggregate stats using shared helper
	const statsList = aggregateTakeStats(takes);

	const leaderboard = statsList.map((s) => ({
	  phone: s.phone,
	  takes: s.takes,
	  points: s.points,
	  won: s.won,
	  lost: s.lost,
	  pending: s.pending,
	  pushed: s.pushed,
	  profileID: phoneToProfileID.get(s.phone) || null,
	}));

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
