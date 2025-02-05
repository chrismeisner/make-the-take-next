// lib/airtable.js
import Airtable from 'airtable';

// We configure the base once using environment vars:
const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY })
  .base(process.env.AIRTABLE_BASE_ID);

/**
 * Fetch Props from Airtable
 * - We'll replicate the logic from your old /api/props code.
 */
export async function fetchProps() {
  try {
	const records = await base('Props')
	  .select({
		view: 'Grid view',
		maxRecords: 100,
		// If needed, filterByFormula or sort, etc.
	  })
	  .all();

	return records.map((rec) => {
	  const f = rec.fields;
	  return {
		propID: f.propID,
		propTitle: f.propTitle || '(No Title)',
		propStatus: f.propStatus || 'open',
		createdAt: rec._rawJson.createdTime,
		// Add as many fields as needed
	  };
	});
  } catch (err) {
	console.error('[lib/airtable] fetchProps error:', err);
	throw err; // Let the caller handle it
  }
}
