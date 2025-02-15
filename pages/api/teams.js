import Airtable from "airtable";

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY })
  .base(process.env.AIRTABLE_BASE_ID);

export default async function handler(req, res) {
  if (req.method !== "GET") {
	return res.status(405).json({ success: false, error: "Method not allowed" });
  }
  
  try {
	const records = await base("Teams")
	  .select({
		maxRecords: 100
	  })
	  .all();
	  
	const teams = records.map(record => {
	  const fields = record.fields;
	  let teamLogo = [];
	  if (Array.isArray(fields.teamLogo)) {
		teamLogo = fields.teamLogo.map(img => ({
		  url: img.url,
		  filename: img.filename
		}));
	  }
	  return {
		teamID: fields.teamID || record.id,
		teamName: fields.teamName || "Unknown Team",
		teamType: fields.teamType || "", // Include teamType so we can filter it later
		teamLogo
	  };
	});
	
	return res.status(200).json({ success: true, teams });
	
  } catch (err) {
	console.error("[/api/teams] error =>", err);
	return res.status(500).json({ success: false, error: "Server error fetching teams" });
  }
}
