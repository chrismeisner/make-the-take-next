// pages/api/props/index.js
import Airtable from 'airtable';

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY })
  .base(process.env.AIRTABLE_BASE_ID);

export default async function handler(req, res) {
  try {
	const records = await base('Props')
	  .select({ view: 'Grid view', maxRecords: 100 })
	  .firstPage();
	  
	const propsData = records.map(record => {
	  const f = record.fields;                // All fields from Airtable
	  const createdAt = record._rawJson.createdTime;
	  
	  const subjectLogoUrls = Array.isArray(f.subjectLogo)
		? f.subjectLogo.map(item => item.url)
		: [];
	  const contentImageUrls = Array.isArray(f.contentImage)
		? f.contentImage.map(item => item.url)
		: [];
	  
	  const contentTitles = f.contentTitles || [];
	  const contentURLs = f.contentURLs || [];
	  const content = contentTitles.map((title, i) => ({
		contentTitle: title,
		contentURL: contentURLs[i] || '',
	  }));

	  // Spread all Airtable fields (like propTitle, propSideAShort, etc.) into the returned object
	  return {
		...f,
		createdAt,
		subjectLogoUrls,
		contentImageUrls,
		content,
	  };
	});
	
	res.status(200).json({ success: true, props: propsData });
  } catch (error) {
	console.error('[API Props] Error:', error);
	res.status(500).json({ success: false, error: 'Server error fetching props' });
  }
}
