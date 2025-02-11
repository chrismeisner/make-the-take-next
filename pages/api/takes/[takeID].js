// pages/api/takes/[takeID].js
import Airtable from "airtable";

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY })
  .base(process.env.AIRTABLE_BASE_ID);

export default async function handler(req, res) {
  if (req.method !== "GET") {
	return res
	  .status(405)
	  .json({ success: false, error: "Method not allowed" });
  }

  const { takeID } = req.query;
  
  try {
	// Query the "Takes" table for a record where the TakeID field equals the provided takeID.
	const records = await base("Takes")
	  .select({
		filterByFormula: `{TakeID} = "${takeID}"`,
		maxRecords: 1,
	  })
	  .firstPage();

	if (!records || records.length === 0) {
	  return res.status(404).json({ success: false, error: "Take not found" });
	}

	const record = records[0];
	const take = {
	  airtableRecordId: record.id,
	  takeID: record.fields.TakeID || record.id,
	  propID: record.fields.propID,
	  propSide: record.fields.propSide,
	  takeMobile: record.fields.takeMobile,
	  takePopularity: record.fields.takePopularity || 0,
	  createdTime: record._rawJson.createdTime,
	  takeStatus: record.fields.takeStatus || "",
	  propTitle: record.fields.propTitle || "",
	  subjectTitle: record.fields.subjectTitle || "",
	  propSideAShort: record.fields.propSideAShort || "Side A",
	  propSideBShort: record.fields.propSideBShort || "Side B",
	};
 
	// Optionally, include related prop data:
	let prop = null;
	let content = [];
	if (record.fields.propID) {
	  const propRecords = await base("Props")
		.select({
		  filterByFormula: `{propID} = "${record.fields.propID}"`,
		  maxRecords: 1,
		})
		.firstPage();

	  if (propRecords.length > 0) {
		const propRec = propRecords[0];
		const pf = propRec.fields;
		prop = {
		  airtableRecordId: propRec.id,
		  propID: pf.propID,
		  propShort: pf.propShort || "",
		  PropSideAShort: pf.PropSideAShort || "Side A",
		  PropSideBShort: pf.PropSideBShort || "Side B",
		  propStatus: pf.propStatus || "open",
		  propSubjectID: pf.propSubjectID || "",
		  propTitle: pf.propTitle || "",
		  propLong: pf.propLong || "",
		};

		const contentTitles = pf.contentTitles || [];
		const contentURLs = pf.contentURLs || [];
		content = contentTitles.map((title, i) => ({
		  contentTitle: title,
		  contentURL: contentURLs[i] || "",
		}));
	  }
	}

	return res.status(200).json({ success: true, take, prop, content });
  } catch (error) {
	console.error("[API Takes] Error fetching single take:", error);
	return res.status(500).json({ success: false, error: "Server error fetching take" });
  }
}
