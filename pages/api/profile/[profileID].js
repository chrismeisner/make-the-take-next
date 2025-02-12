import Airtable from 'airtable';

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY })
  .base(process.env.AIRTABLE_BASE_ID);

export default async function handler(req, res) {
  // Only allow GET requests
  if (req.method !== 'GET') {
	return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { profileID } = req.query;

  try {
	// Fetch the profile record from the Profiles table
	const found = await base('Profiles')
	  .select({ filterByFormula: `{profileID}="${profileID}"`, maxRecords: 1 })
	  .all();

	if (found.length === 0) {
	  return res.status(404).json({ success: false, error: 'Profile not found' });
	}

	const profRec = found[0];
	const pf = profRec.fields;

	// Initialize an array to hold the user's takes
	let userTakes = [];
	let userPacks = [];
	if (Array.isArray(pf.Takes) && pf.Takes.length > 0) {
	  // Build a filter formula to fetch all takes linked to this profile
	  const filterByFormula = `OR(${pf.Takes.map((id) => `RECORD_ID()='${id}'`).join(',')})`;
	  const takeRecords = await base('Takes')
		.select({ filterByFormula, maxRecords: 5000 })
		.all();

	  // Filter out any takes that have been overwritten and map the fields
	  userTakes = takeRecords
		.filter((t) => t.fields.takeStatus !== 'overwritten')
		.map((t) => {
		  const tf = t.fields;
		  
		  // Collect all the Packs linked to the take
		  const packs = tf.Packs || []; // Packs field is an array of linked records

		  // Add linked packs to the userPacks array if the take is verified (not Pending)
		  if (tf.takeResult === 'Won' || tf.takeResult === 'Lost') {
			userPacks.push(...packs); // Spread the packs to collect them all
		  }

		  return {
			airtableRecordId: t.id,
			takeID: tf.TakeID || t.id,
			propID: tf.propID || '',
			propSide: tf.propSide || null,
			propTitle: tf.propTitle || '',
			subjectTitle: tf.subjectTitle || '',
			takePopularity: tf.takePopularity || 0,
			createdTime: t._rawJson.createdTime,
			takeStatus: tf.takeStatus || '',
			takeResult: tf.takeResult || '',
			takePTS: tf.takePTS || 0,
			packs, // Return the packs linked to the take
		  };
		});
	}

	// Fetch packURL for each unique pack
	const uniquePacks = [...new Set(userPacks)];
	const packDetails = await Promise.all(
	  uniquePacks.map(async (packId) => {
		const packRecord = await base('Packs')
		  .select({ filterByFormula: `RECORD_ID()="${packId}"`, maxRecords: 1 })
		  .firstPage();

		if (packRecord.length > 0) {
		  const pack = packRecord[0].fields;
		  return {
			id: packId,
			packURL: pack.packURL || '',
		  };
		}
		return null;
	  })
	);

	// Filter out any null values if the pack URL was not found
	const validPacks = packDetails.filter((pack) => pack !== null);

	// Build the profile data object
	const profileData = {
	  airtableRecordId: profRec.id,
	  profileID: pf.profileID,
	  profileMobile: pf.profileMobile,
	  profileUsername: pf.profileUsername || '',
	  profileAvatar: pf.profileAvatar || [],
	  createdTime: profRec._rawJson.createdTime,
	};

	return res.status(200).json({
	  success: true,
	  profile: profileData,
	  totalTakes: userTakes.length,
	  userTakes,
	  userPacks: validPacks, // Send packs with the packURL for the front end to use
	});
  } catch (err) {
	console.error('[GET /api/profile/:profileID] Error:', err);
	return res.status(500).json({ success: false, error: 'Server error fetching profile' });
  }
}
