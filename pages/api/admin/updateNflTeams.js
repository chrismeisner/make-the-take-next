import { getToken } from "next-auth/jwt";
import Airtable from "airtable";

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY })
  .base(process.env.AIRTABLE_BASE_ID);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) {
    return res.status(401).json({ success: false, error: "Unauthorized" });
  }

  try {
    // Fetch NFL teams from ESPN API
    const url = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams";
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`ESPN API responded with status ${response.status}`);
    }
    const data = await response.json();
    // Extract team list
    const teams = data.sports?.[0]?.leagues?.[0]?.teams || [];
    let processedCount = 0;

    for (const item of teams) {
      const teamInfo = item.team || item;
      const teamID = teamInfo.id?.toString();
      const teamName = teamInfo.name || teamInfo.displayName || "";
      const teamCity = teamInfo.location || "";
      const teamLogoURL = teamInfo.logos?.[0]?.href || "";
      const teamAbbreviation = teamInfo.abbreviation || "";

      const fields = {
        teamID,
        teamName,
        teamCity,
        teamLogoURL,
        teamAbbreviation,
        teamLeague: "NFL",
      };

      // Upsert into Airtable Teams table
      const existing = await base("Teams")
        .select({ filterByFormula: `AND({teamID}="${teamID}", {teamLeague}="NFL")`, maxRecords: 1 })
        .firstPage();

      if (existing.length) {
        await base("Teams").update([{ id: existing[0].id, fields }]);
      } else {
        await base("Teams").create([{ fields }]);
      }

      processedCount++;
    }

    return res.status(200).json({ success: true, processedCount });
  } catch (error) {
    console.error("[admin/updateNflTeams] Error:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
} 