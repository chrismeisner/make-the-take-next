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
	// 1) Fetch the profile record from the Profiles table
	const found = await base('Profiles')
	  .select({ filterByFormula: `{profileID}="${profileID}"`, maxRecords: 1 })
	  .all();

	if (found.length === 0) {
	  return res.status(404).json({ success: false, error: 'Profile not found' });
	}

	const profRec = found[0];
	const pf = profRec.fields;

	// Initialize arrays to hold user's takes & packs
	let userTakes = [];
	let userPacks = [];

	// 2) If the profile has "Takes" linked, fetch them
	if (Array.isArray(pf.Takes) && pf.Takes.length > 0) {
	  // Build a filter formula to fetch all takes linked to this profile
	  const filterByFormula = `OR(${pf.Takes.map((id) => `RECORD_ID()='${id}'`).join(',')})`;
	  const takeRecords = await base('Takes')
		.select({ filterByFormula, maxRecords: 5000 })
		.all();

	  // Filter out any takes that have been overwritten
	  userTakes = takeRecords
		.filter((t) => t.fields.takeStatus !== 'overwritten')
		.map((t) => {
		  const tf = t.fields;
		  // Collect linked pack IDs from the take
		  const packs = tf.Packs || [];
		  // Add linked packs to userPacks array (we'll deduplicate later)
		  userPacks.push(...packs);
		  let contentImageUrls = [];
		  if (Array.isArray(tf.contentImage)) {
			contentImageUrls = tf.contentImage.map((att) => att.url);
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
			takeTitle: tf.takeTitle || '',
			takeContentImageUrls: contentImageUrls,
			packs, // packs linked to this take
		  };
		});
	}

	// 3) Deduplicate and fetch pack details for each unique pack ID in userPacks.
	const uniquePackIDs = [...new Set(userPacks)];
	const packDetails = await Promise.all(
	  uniquePackIDs.map(async (packId) => {
		const packRecords = await base("Packs")
		  .select({ filterByFormula: `RECORD_ID()="${packId}"`, maxRecords: 1 })
		  .firstPage();
		if (packRecords.length > 0) {
		  const pack = packRecords[0].fields;
		  return {
			id: packId,
			packURL: pack.packURL || '',
			packTitle: pack.packTitle || '',
			packStatus: pack.packStatus || '',
			packCover: pack.packCover || [],
			eventTime: pack.eventTime || null,
		  };
		}
		return null;
	  })
	);
	const validPacks = packDetails.filter((p) => p !== null);

	// 4) Fetch the Teams record if profileTeam is linked.
	let profileTeamData = null;
	if (Array.isArray(pf.profileTeam) && pf.profileTeam.length > 0) {
	  const teamRecordId = pf.profileTeam[0];
	  if (teamRecordId) {
		try {
		  const teamRec = await base('Teams').find(teamRecordId);
		  const tf = teamRec.fields;
		  let teamLogo = [];
		  if (Array.isArray(tf.teamLogo)) {
			teamLogo = tf.teamLogo.map((img) => ({
			  url: img.url,
			  filename: img.filename,
			}));
		  }
		  profileTeamData = {
			airtableId: teamRec.id,
			teamID: tf.teamID || '',
			teamName: tf.teamName || '',
			teamLogo,
		  };
		} catch (err) {
		  console.error('[profile] Error fetching team record =>', err);
		}
	  }
	}

	// 5) Build the profile data object
	const profileData = {
	  airtableRecordId: profRec.id,
	  profileID: pf.profileID,
	  profileMobile: pf.profileMobile,
	  profileUsername: pf.profileUsername || '',
	  profileAvatar: pf.profileAvatar || [],
	  profileTeamData, // Contains favorite team info
	  createdTime: profRec._rawJson.createdTime,
	};

	// 6) Return the aggregated data
	return res.status(200).json({
	  success: true,
	  profile: profileData,
	  totalTakes: userTakes.length,
	  userTakes,
	  userPacks: validPacks,
	});
  } catch (err) {
	console.error('[GET /api/profile/:profileID] Error:', err);
	return res.status(500).json({ success: false, error: 'Server error fetching profile' });
  }
}
