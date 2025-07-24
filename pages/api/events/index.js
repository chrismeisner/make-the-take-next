import Airtable from "airtable";

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY })
  .base(process.env.AIRTABLE_BASE_ID);

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }
  try {
    // Fetch events and enrich with team logo URLs
    const records = await base("Events").select({ maxRecords: 100 }).all();
    const events = await Promise.all(records.map(async (rec) => {
      const f = rec.fields;
      const homeLink = Array.isArray(f.homeTeamLink) ? f.homeTeamLink[0] : null;
      const awayLink = Array.isArray(f.awayTeamLink) ? f.awayTeamLink[0] : null;
      let homeTeamLogo = null;
      let awayTeamLogo = null;
      if (homeLink) {
        try {
          const teamRec = await base("Teams").find(homeLink);
          const logoURL = teamRec.fields.teamLogoURL;
          if (typeof logoURL === "string" && logoURL) {
            homeTeamLogo = logoURL.startsWith("@")
              ? logoURL.substring(1)
              : logoURL;
          }
        } catch {}
      }
      if (awayLink) {
        try {
          const teamRec2 = await base("Teams").find(awayLink);
          const logoURL2 = teamRec2.fields.teamLogoURL;
          if (typeof logoURL2 === "string" && logoURL2) {
            awayTeamLogo = logoURL2.startsWith("@")
              ? logoURL2.substring(1)
              : logoURL2;
          }
        } catch {}
      }
      // Pull ESPN game ID or link field if present
      let espnId = f.espnGameID || f.espnLink || null;
      if (typeof espnId === "string" && espnId.startsWith("@")) {
        espnId = espnId.substring(1);
      }

      return {
        id: rec.id,
        eventTime: f.eventTime || null,
        eventTitle: f.eventTitle || "",
        homeTeam: f.homeTeam || "",
        awayTeam: f.awayTeam || "",
        homeTeamLink: homeLink,
        awayTeamLink: awayLink,
        homeTeamLogo,
        awayTeamLogo,
        espnLink: espnId,
      };
    }));
    return res.status(200).json({ success: true, events });
  } catch (error) {
    console.error("[api/events] Error =>", error);
    return res.status(500).json({ success: false, error: "Failed to fetch events" });
  }
} 