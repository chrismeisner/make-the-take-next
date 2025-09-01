// pages/api/teams.js

import Airtable from "airtable";
import { getDataBackend } from "../../lib/runtimeConfig";
import { query } from "../../lib/db/postgres";

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY })
  .base(process.env.AIRTABLE_BASE_ID);

export default async function handler(req, res) {
  if (req.method !== "GET") {
	return res.status(405).json({ success: false, error: "Method not allowed" });
  }
  
  try {
    if (getDataBackend() === 'postgres') {
      const { rows } = await query(
        `SELECT id, team_id, name, team_slug, league, emoji, logo_url
           FROM teams
           ORDER BY league, name`);
      const teams = rows.map(r => ({
        recordId: r.id,
        teamID: r.team_id || r.id,
        teamName: r.name || "Unknown Team",
        teamNameFull: r.name || "Unknown Team",
        teamAbbreviation: r.team_slug || "",
        teamLeague: r.league || "",
        teamType: "",
        teamLogo: [],
        teamLogoURL: r.logo_url || null
      }));
      return res.status(200).json({ success: true, teams });
    }
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
		recordId: record.id, // Provide the Airtable record id.
		teamID: fields.teamID || record.id,
		teamName: fields.teamName || "Unknown Team",
		teamNameFull: fields.teamNameFull || (fields.teamName || "Unknown Team"),
		teamAbbreviation: fields.teamAbbreviation || "",
		teamLeague: fields.teamLeague || "",
		teamType: fields.teamType || "",
		teamLogo,
		teamLogoURL: fields.teamLogoURL || null
	  };
	});
	
	return res.status(200).json({ success: true, teams });
	
  } catch (err) {
	console.error("[/api/teams] error =>", err);
	return res.status(500).json({ success: false, error: "Server error fetching teams" });
  }
}
