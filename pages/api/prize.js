// File: /pages/api/prize.js
import Airtable from "airtable";
import { getDataBackend } from "../../lib/runtimeConfig";

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY })
  .base(process.env.AIRTABLE_BASE_ID);

export default async function handler(req, res) {
  if (req.method !== "GET") {
	return res
	  .status(405)
	  .json({ success: false, error: "Method not allowed" });
  }

  try {
    if (getDataBackend() === 'postgres') {
      // Prizes feature is disabled in Postgres mode
      return res.status(200).json({ success: true, prize: null });
    }
	// We still fetch the first "available" prize
	const records = await base("Prizes")
	  .select({
		maxRecords: 1,
		filterByFormula: `{prizeStatus} = "available"`,
		// optional: sort if you want a specific ordering
	  })
	  .firstPage();

	if (records.length === 0) {
	  // If none available, return null
	  return res.status(200).json({ success: true, prize: null });
	}

	const rec = records[0];
	const f = rec.fields;

	// Parse attachments
	let prizeIMGs = [];
	if (Array.isArray(f.prizeIMG)) {
	  prizeIMGs = f.prizeIMG.map((att) => ({
		url: att.url,
		filename: att.filename,
	  }));
	}

	const prize = {
	  prizeID: f.prizeID || rec.id,
	  prizeTitle: f.prizeTitle || "Untitled",
	  prizePTS: f.prizePTS || 0,
	  prizeIMGs,
	};

	return res.status(200).json({ success: true, prize });
  } catch (err) {
	console.error("[/api/prize] Error =>", err);
	return res
	  .status(500)
	  .json({ success: false, error: "Server error fetching prize" });
  }
}
