// File: /pages/api/props/index.js
import fetch from "node-fetch";

/**
 * This version uses Airtable's REST API (instead of the Airtable.js client),
 * allowing you to pass `?limit=10` and `?offset=xyz` to do server-side pagination.
 *
 * Example usage:
 *  GET /api/props?limit=10
 *  => returns up to 10 records plus a `nextOffset` if more exist
 *  GET /api/props?limit=10&offset=itrx12345
 *  => returns the next 10
 */
export default async function handler(req, res) {
  // Only GET allowed
  if (req.method !== "GET") {
	return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  try {
	// 1) Parse limit + offset from query
	const limit = parseInt(req.query.limit || "10", 10); // default to 10
	const offset = req.query.offset || ""; // if provided, use it; otherwise blank

	// 2) Build Airtable REST API URL
	const baseID = process.env.AIRTABLE_BASE_ID; // e.g. "appAbcd123"
	const apiKey = process.env.AIRTABLE_API_KEY;
	const tableName = "Props";

	// We'll set pageSize = limit
	// If you want to filter out archived props, you can add &filterByFormula=NOT({propStatus}="archived")
	let url = `https://api.airtable.com/v0/${baseID}/${encodeURIComponent(tableName)}?pageSize=${limit}&view=Grid%20view`;
	if (offset) {
	  url += `&offset=${offset}`;
	}

	// 3) Fetch from Airtable
	const airtableRes = await fetch(url, {
	  headers: {
		Authorization: `Bearer ${apiKey}`,
	  },
	});
	if (!airtableRes.ok) {
	  const text = await airtableRes.text();
	  return res.status(airtableRes.status).json({ success: false, error: text });
	}

	const data = await airtableRes.json();
	// data => { records: [...], offset?: string }

	// 4) Convert each record to the shape we want
	const propsData = data.records.map((rec) => {
	  const f = rec.fields;
	  return {
		airtableId: rec.id,
		propID: f.propID || null,
		propTitle: f.propTitle || "Untitled",
		propSummary: f.propSummary || "",
		propStatus: f.propStatus || "open",

		// Important for custom short labels:
		PropSideAShort: f.PropSideAShort || "",
		PropSideBShort: f.PropSideBShort || "",

		propShort: f.propShort || "",

		// Example: subjectLogo, contentImage, etc.
		subjectLogoUrls: Array.isArray(f.subjectLogo)
		  ? f.subjectLogo.map((img) => img.url)
		  : [],
		contentImageUrls: Array.isArray(f.contentImage)
		  ? f.contentImage.map((img) => img.url)
		  : [],

		// If you previously had "linkedPacks" logic, you can add it here
		// linkedPacks: ...

		createdAt: rec.createdTime,
	  };
	});

	// 5) If there's an offset in the response, that's for the next page
	const nextOffset = data.offset || null;

	// 6) Return partial success + nextOffset
	res.status(200).json({
	  success: true,
	  props: propsData,
	  nextOffset, // null if no more pages
	});
  } catch (err) {
	console.error("[/api/props] error =>", err);
	res.status(500).json({ success: false, error: err.message });
  }
}
