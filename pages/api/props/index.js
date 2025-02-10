// File: /pages/api/props/index.js
import fetch from "node-fetch";

export default async function handler(req, res) {
  if (req.method !== "GET") {
	return res
	  .status(405)
	  .json({ success: false, error: "Method not allowed" });
  }

  try {
	// 1) Parse limit + offset from query
	const limit = parseInt(req.query.limit || "10", 10);
	const offset = req.query.offset || ""; // if blank => no offset param
	
	// 2) Build Airtable REST URL
	const baseID = process.env.AIRTABLE_BASE_ID; // e.g. "appXYZ"
	const tableName = "Props";
	let url = `https://api.airtable.com/v0/${baseID}/${encodeURIComponent(
	  tableName
	)}?pageSize=${limit}&view=Grid%20view`; 
	if (offset) {
	  url += `&offset=${offset}`;
	}

	// (Optional) filter out archived or other conditions:
	// e.g. &filterByFormula=NOT({propStatus}="archived")

	// 3) Fetch from Airtable
	const airtableRes = await fetch(url, {
	  headers: {
		Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}`,
	  },
	});
	if (!airtableRes.ok) {
	  const text = await airtableRes.text();
	  return res
		.status(airtableRes.status)
		.json({ success: false, error: text });
	}
	const data = await airtableRes.json();
	// data => { records: [...], offset: 'someString' | undefined }

	// 4) Map each record to a simpler object
	const propsData = data.records.map((rec) => {
	  const f = rec.fields;
	  return {
		// e.g. from your Airtable "Props" columns:
		airtableId: rec.id,
		propID: f.propID || null,
		propTitle: f.propTitle || "Untitled",
		propSummary: f.propSummary || "",
		propStatus: f.propStatus || "open",
		propShort: f.propShort || "",
		// Possibly subjectTitle, subjectLogo, etc.:
		subjectLogoUrls: Array.isArray(f.subjectLogo)
		  ? f.subjectLogo.map((img) => img.url)
		  : [],
		contentImageUrls: Array.isArray(f.contentImage)
		  ? f.contentImage.map((img) => img.url)
		  : [],
		linkedPacks: [], // if you want to do a separate REST call or store a "Packs" ID, etc.
		createdAt: rec.createdTime,
		// Or anything else you need
	  };
	});

	// 5) If data.offset exists, that's the next offset for the next batch
	const nextOffset = data.offset || null;

	// 6) Return success with just these records and nextOffset
	return res.status(200).json({
	  success: true,
	  props: propsData,
	  nextOffset, // null if no more pages
	});
  } catch (err) {
	console.error("[/api/props] error =>", err);
	return res.status(500).json({ success: false, error: err.message });
  }
}
