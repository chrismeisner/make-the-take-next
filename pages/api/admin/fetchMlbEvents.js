// File: pages/api/admin/fetchMlbEvents.js

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
    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, "");
    const url = `https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard?dates=${dateStr}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`ESPN API responded with status ${response.status}`);
    }
    const data = await response.json();
    const events = data.events || [];
    let processedCount = 0;

    for (const evt of events) {
      const espnGameID = evt.id;
      const eventTime = evt.date;
      const eventTitle = evt.name;
      const eventStatus = evt.status?.type?.state || evt.status?.type?.shortDetail || "";
      let eventLeague = data.leagues?.[0]?.name || "";
      // Normalize league code for MLB
      if (eventLeague === "Major League Baseball") {
        eventLeague = "mlb";
      }
      let homeTeam = "";
      let awayTeam = "";
      const comp = evt.competitions?.[0];
      if (comp && Array.isArray(comp.competitors)) {
        for (const team of comp.competitors) {
          if (team.homeAway === "home") {
            homeTeam = team.team.displayName;
          } else if (team.homeAway === "away") {
            awayTeam = team.team.displayName;
          }
        }
      }

      const existing = await base("Events")
        .select({ filterByFormula: `{espnGameID}="${espnGameID}"`, maxRecords: 1 })
        .firstPage();
      const fields = { espnGameID, eventTime, eventTitle, eventStatus, homeTeam, awayTeam, eventLeague };

      if (existing.length) {
        await base("Events").update([{ id: existing[0].id, fields }]);
      } else {
        await base("Events").create([{ fields }]);
      }

      processedCount++;
    }

    return res.status(200).json({ success: true, processedCount });
  } catch (error) {
    console.error("[admin/fetchMlbEvents] Error:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
} 