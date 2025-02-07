// pages/api/prop.js
import Airtable from 'airtable';

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY })
  .base(process.env.AIRTABLE_BASE_ID);

export default async function handler(req, res) {
  const { propID } = req.query;
  if (!propID) {
	return res.status(400).json({ success: false, error: 'Missing propID' });
  }

  try {
	// 1) Fetch the proposition record from the Props table
	const records = await base('Props')
	  .select({
		filterByFormula: `{propID} = "${propID}"`,
		maxRecords: 1,
	  })
	  .firstPage();

	if (!records || records.length === 0) {
	  return res.status(404).json({ success: false, error: 'Prop not found' });
	}

	const record = records[0];
	const data = record.fields;
	const createdAt = record._rawJson.createdTime;

	// 2) Extract additional fields for display (subject logo and content image)
	let subjectLogoUrl = '';
	if (data.subjectLogo && Array.isArray(data.subjectLogo) && data.subjectLogo.length > 0) {
	  subjectLogoUrl = data.subjectLogo[0].url || '';
	}

	let contentImageUrl = '';
	if (Array.isArray(data.contentImage) && data.contentImage.length > 0) {
	  contentImageUrl = data.contentImage[0].url || '';
	}

	// 3) Build a list of related content if available
	const contentTitles = data.contentTitles || [];
	const contentURLs = data.contentURLs || [];
	const contentList = contentTitles.map((title, i) => ({
	  contentTitle: title,
	  contentURL: contentURLs[i] || '',
	}));

	// 4) Query the Takes table to count active votes for each side
	const takesRecords = await base('Takes')
	  .select({
		filterByFormula: `AND({propID} = "${propID}", {takeStatus} != "overwritten")`,
	  })
	  .all();

	let sideACount = 0;
	let sideBCount = 0;
	takesRecords.forEach((take) => {
	  if (take.fields.propSide === 'A') sideACount++;
	  if (take.fields.propSide === 'B') sideBCount++;
	});

	// 5) Return the full prop data along with the vote counts
	return res.status(200).json({
	  success: true,
	  propID,
	  ...data,
	  createdAt,
	  subjectLogoUrl,
	  contentImageUrl,
	  content: contentList,
	  sideACount,
	  sideBCount,
	});
  } catch (error) {
	console.error('[API Prop] Error:', error);
	return res.status(500).json({ success: false, error: 'Server error fetching prop data' });
  }
}
