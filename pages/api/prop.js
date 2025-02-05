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
	// Query Airtable for the record where the propID field equals the given propID
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

	// Extract URLs for subject logo and content image if available
	let subjectLogoUrl = '';
	if (data.subjectLogo && Array.isArray(data.subjectLogo) && data.subjectLogo.length > 0) {
	  subjectLogoUrl = data.subjectLogo[0].url || '';
	}

	let contentImageUrl = '';
	if (Array.isArray(data.contentImage) && data.contentImage.length > 0) {
	  contentImageUrl = data.contentImage[0].url || '';
	}

	// Build a list of related content (if your table stores separate title/URL arrays)
	const contentTitles = data.contentTitles || [];
	const contentURLs = data.contentURLs || [];
	const contentList = contentTitles.map((title, i) => ({
	  contentTitle: title,
	  contentURL: contentURLs[i] || '',
	}));

	return res.status(200).json({
	  success: true,
	  propID,
	  ...data,
	  createdAt,
	  subjectLogoUrl,
	  contentImageUrl,
	  content: contentList,
	});
  } catch (error) {
	console.error('[API Prop] Error:', error);
	return res
	  .status(500)
	  .json({ success: false, error: 'Server error fetching prop data' });
  }
}
