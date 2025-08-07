// File: pages/api/admin/fetchNflEvents.js
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
    const { date } = req.body;
    console.log(`[admin/fetchNflEvents] Client request body: ${JSON.stringify(req.body)}`);
    const dateStr = date
      ? date
      : new Date().toISOString().slice(0, 10).replace(/-/g, "");
    console.log(`[admin/fetchNflEvents] Fetching NFL events for date=${dateStr}`);
    const ESPN_API_BASE = process.env.ESPN_CORE_API_BASE || 'https://sports.core.api.espn.com';
    const url = `${ESPN_API_BASE}/v2/sports/football/leagues/nfl/events?dates=${dateStr}`;
    console.log(`[admin/fetchNflEvents] ESPN request URL: ${url}`);
    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    console.log(`[admin/fetchNflEvents] ESPN response status: ${response.status}`);
    if (!response.ok) {
      throw new Error(`ESPN API responded with status ${response.status}`);
    }
    const raw = await response.clone().text();
    console.log(`[admin/fetchNflEvents] ESPN raw response: ${raw}`);
    let data;
    try {
      data = JSON.parse(raw);
    } catch (err) {
      console.error(`[admin/fetchNflEvents] Error parsing ESPN response JSON:`, err);
      throw err;
    }
    // Handle both v1 'events' array and hypermedia 'items' array
    let events = [];
    if (Array.isArray(data.events)) {
      events = data.events;
    } else if (Array.isArray(data.items)) {
      console.log(`[admin/fetchNflEvents] Hypermedia items count: ${data.items.length}`);
      events = await Promise.all(
        data.items.map(async (item) => {
          const refUrl = item.$ref;
          console.log(`[admin/fetchNflEvents] Fetching event detail from ${refUrl}`);
          const detailRes = await fetch(refUrl, { headers: { Accept: 'application/json' } });
          console.log(`[admin/fetchNflEvents] Detail response status for ${refUrl}: ${detailRes.status}`);
          const detailRaw = await detailRes.text();
          console.log(`[admin/fetchNflEvents] Raw detail for ${refUrl}: ${detailRaw}`);
          try {
            return JSON.parse(detailRaw);
          } catch (err) {
            console.error(`[admin/fetchNflEvents] Error parsing detail JSON for ${refUrl}:`, err);
            return null;
          }
        })
      );
      // Filter out any null results
      events = events.filter(Boolean);
    }
    let processedCount = 0;
    const eventsOut = [];

    for (const evt of events) {
      const espnGameID = evt.id;
      const eventTime = evt.date;
      const eventTitle = evt.name;
      let eventStatus = evt.status?.type?.state || evt.status?.type?.shortDetail || "";
      let eventLeague = "nfl";
      let homeTeam = "";
      let awayTeam = "";
      let homeTeamLink = [];
      let awayTeamLink = [];
      const comp = evt.competitions?.[0];
      if (comp && Array.isArray(comp.competitors)) {
        for (const competitor of comp.competitors) {
          // Use competitor.id as ESPN team ID
          const espnTeamId = competitor.id?.toString();
          if (!espnTeamId) continue;
          if (competitor.homeAway === "home") {
            homeTeam = competitor.team?.displayName || `Team ${espnTeamId}`;
            console.log(`[admin/fetchNflEvents] Matching home competitor.id: ${espnTeamId}`);
            const homeRecs = await base("Teams")
              .select({ filterByFormula: `AND({teamID}="${espnTeamId}", {teamLeague}="NFL")`, maxRecords: 1 })
              .firstPage();
            if (homeRecs.length) {
              console.log(`[admin/fetchNflEvents] Linked home team: ESPN ID ${espnTeamId} → Airtable ID ${homeRecs[0].id}`);
              homeTeamLink = [homeRecs[0].id];
            } else {
              console.log(`[admin/fetchNflEvents] No Teams record found for ESPN ID ${espnTeamId}`);
            }
          } else if (competitor.homeAway === "away") {
            awayTeam = competitor.team?.displayName || `Team ${espnTeamId}`;
            console.log(`[admin/fetchNflEvents] Matching away competitor.id: ${espnTeamId}`);
            const awayRecs = await base("Teams")
              .select({ filterByFormula: `AND({teamID}="${espnTeamId}", {teamLeague}="NFL")`, maxRecords: 1 })
              .firstPage();
            if (awayRecs.length) {
              console.log(`[admin/fetchNflEvents] Linked away team: ESPN ID ${espnTeamId} → Airtable ID ${awayRecs[0].id}`);
              awayTeamLink = [awayRecs[0].id];
            } else {
              console.log(`[admin/fetchNflEvents] No Teams record found for ESPN ID ${espnTeamId}`);
            }
          }
        }
      }
      // Fetch competition status details for state and label
      let eventLabel = "";
      if (comp?.status?.$ref) {
        console.log(`[admin/fetchNflEvents] Fetching status for event ${espnGameID} from ${comp.status.$ref}`);
        try {
          const statusRes = await fetch(comp.status.$ref, { headers: { Accept: 'application/json' } });
          console.log(`[admin/fetchNflEvents] Status response for event ${espnGameID}: ${statusRes.status}`);
          const statusJson = await statusRes.json();
          eventStatus = statusJson.type?.state || "";
          eventLabel = statusJson.type?.shortDetail || statusJson.type?.detail || "";
          console.log(`[admin/fetchNflEvents] Parsed status for event ${espnGameID}: state=${eventStatus}, label=${eventLabel}`);
        } catch (err) {
          console.error(`[admin/fetchNflEvents] Error fetching/parsing status for event ${espnGameID}:`, err);
        }
      }
      const fields = {
        espnGameID,
        eventTime,
        eventTitle,
        eventStatus,
        eventLabel,
        homeTeamLink,
        awayTeamLink,
        eventLeague,
      };

      const existing = await base("Events")
        .select({ filterByFormula: `{espnGameID}="${espnGameID}"`, maxRecords: 1 })
        .firstPage();

      if (existing.length) {
        await base("Events").update([{ id: existing[0].id, fields }]);
      } else {
        await base("Events").create([{ fields }]);
      }

      processedCount++;
      eventsOut.push({ espnGameID, eventTime, eventTitle, eventStatus, eventLabel, homeTeamLink, awayTeamLink });
    }
    if (eventsOut.length) {
      // Fetch all team slugs for linking
      const teamRecs = await base('Teams').select({ fields: ['teamSlug'] }).all();
      const slugMap = Object.fromEntries(teamRecs.map(r => [r.id, r.fields.teamSlug]));
      eventsOut.forEach(e => {
        e.homeTeamSlug = slugMap[e.homeTeamLink[0]] || null;
        e.awayTeamSlug = slugMap[e.awayTeamLink[0]] || null;
      });
    }
    console.log(`[admin/fetchNflEvents] Sending response to client: success=true, processedCount=${processedCount}`);
    return res.status(200).json({ success: true, processedCount, events: eventsOut });
  } catch (error) {
    console.error("[admin/fetchNflEvents] Error:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
}