import Airtable from "airtable";
import { getDataBackend } from "../../lib/runtimeConfig";
import { query } from "../../lib/db/postgres";

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY })
  .base(process.env.AIRTABLE_BASE_ID);

export default async function handler(req, res) {
  // Only allow GET requests
  if (req.method !== "GET") {
	return res.status(405).json({ success: false, error: "Method not allowed" });
  }
  
  try {
    if (getDataBackend() === 'postgres') {
      const { rows } = await query(
        `SELECT id, title, value FROM prizes ORDER BY title`);
      const prizes = rows.map(r => ({
        prizeID: r.id,
        prizeTitle: r.title || 'Untitled',
        prizePTS: 0,
        prizeIMGs: [],
      }));
      return res.status(200).json({ success: true, prizes });
    }
	// Fetch all available prizes, sorted by prizePTS ascending
	const records = await base("Prizes")
	  .select({
		filterByFormula: `{prizeStatus} = "available"`,
		sort: [{ field: "prizePTS", direction: "asc" }],
	  })
	  .all();

	// Map each record to our desired prize object
	const prizes = records.map((rec) => {
	  const f = rec.fields;
	  let prizeIMGs = [];
	  if (Array.isArray(f.prizeIMG)) {
		prizeIMGs = f.prizeIMG.map((att) => ({
		  url: att.url,
		  filename: att.filename,
		}));
	  }
	  return {
		prizeID: f.prizeID || rec.id,
		prizeTitle: f.prizeTitle || "Untitled",
		prizePTS: f.prizePTS || 0,
		prizeIMGs,
	  };
	});

	return res.status(200).json({ success: true, prizes });
  } catch (err) {
	console.error("[/api/prizes] Error =>", err);
	return res.status(500).json({ success: false, error: "Server error fetching prizes" });
  }
}
