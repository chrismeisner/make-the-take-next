import Airtable from "airtable";
import { getToken } from "next-auth/jwt";

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY })
  .base(process.env.AIRTABLE_BASE_ID);

// Fetch latest scores/status from ESPN for a given game
async function fetchEspnScores({ league, espnGameID }) {
  try {
    let pathLeague = null;
    const lg = String(league || '').toLowerCase();
    if (lg === 'mlb' || lg.includes('baseball')) {
      pathLeague = 'baseball/mlb';
    } else if (lg === 'nfl' || lg.includes('football')) {
      pathLeague = 'football/nfl';
    }
    if (!pathLeague) return null;
    const url = `https://site.api.espn.com/apis/site/v2/sports/${pathLeague}/summary?event=${encodeURIComponent(espnGameID)}`;
    const resp = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!resp.ok) return null;
    const data = await resp.json();
    const comp = Array.isArray(data?.header?.competitions) ? data.header.competitions[0] : null;
    const statusState = data?.header?.competitions?.[0]?.status?.type?.state || data?.header?.competitions?.[0]?.status?.type?.name || '';
    let homeScore = null;
    let awayScore = null;
    if (comp && Array.isArray(comp.competitors)) {
      for (const c of comp.competitors) {
        const scoreNum = c.score != null ? parseInt(c.score, 10) : null;
        if (c.homeAway === 'home') homeScore = scoreNum;
        if (c.homeAway === 'away') awayScore = scoreNum;
      }
    }
    return { homeScore, awayScore, statusState };
  } catch {
    return null;
  }
}

// Helper: fetch team display name by record id
async function getTeamNameByRecordId(recordId) {
  if (!recordId) return null;
  try {
    const rec = await base("Teams").find(recordId);
    return rec.fields.teamNameFull || rec.fields.teamName || null;
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) {
    return res.status(401).json({ success: false, error: "Unauthorized" });
  }

  try {
    // Accept query params or JSON body
    const params = req.query && Object.keys(req.query).length ? req.query : req.body || {};
    const date = params.date; // YYYY-MM-DD (intended as local date in admin's timezone)
    const league = (params.league || "").toLowerCase();
    const dryRun = String(params.dryRun || "false").toLowerCase() === "true";
    const type = (params.type || "moneyline").toLowerCase();
    const tz = params.tz || null; // IANA timezone from browser, e.g. "America/Los_Angeles"

    if (!date || !league) {
      return res.status(400).json({ success: false, error: "Missing required params: date, league" });
    }
    if (type !== "moneyline") {
      return res.status(400).json({ success: false, error: "Only type=moneyline is supported" });
    }

    console.log(`🎯 [gradeMoneylineProps] Start → date=${date}, league=${league}, type=${type}, dryRun=${dryRun}, tz=${tz || 'unset'}`);

    // 1) Fetch Events on this date + league that have scores present
    // Build timezone-aware date filter. If tz provided, use SET_TIMEZONE to compute day in that timezone.
    const dateFormula = tz
      ? `DATETIME_FORMAT(SET_TIMEZONE({eventTime}, "${tz}"), 'YYYY-MM-DD') = "${date}"`
      : `DATETIME_FORMAT({eventTime}, 'YYYY-MM-DD') = "${date}"`;
    const events = await base("Events")
      .select({
        filterByFormula: `AND(${dateFormula}, LOWER({eventLeague}) = "${league}")`,
      })
      .all();

    const updates = [];
    const results = [];

    console.log(`📅 [gradeMoneylineProps] Found ${events.length} events with scores for ${date} (${league})`);

    // 2) For each event, find eligible moneyline props and compute results
    for (const evt of events) {
      let ef = evt.fields;
      const eventId = evt.id;
      let homeScore = typeof ef.homeTeamScore === "number" ? ef.homeTeamScore : null;
      let awayScore = typeof ef.awayTeamScore === "number" ? ef.awayTeamScore : null;
      const espnId = String(ef.espnGameID || '').trim();
      let eventStatus = String(ef.eventStatus || '').toLowerCase();

      // Refresh from ESPN if scores are missing or event not final
      if (espnId) {
        const refreshed = await fetchEspnScores({ league, espnGameID: espnId });
        if (refreshed && (refreshed.homeScore != null || refreshed.awayScore != null)) {
          homeScore = refreshed.homeScore != null ? refreshed.homeScore : homeScore;
          awayScore = refreshed.awayScore != null ? refreshed.awayScore : awayScore;
          const newState = String(refreshed.statusState || '').toLowerCase();
          if (newState) eventStatus = newState;
          // Persist refreshed scores/status back to Events for visibility
          try {
            await base('Events').update([{ id: eventId, fields: {
              ...(homeScore != null ? { homeTeamScore: homeScore } : {}),
              ...(awayScore != null ? { awayTeamScore: awayScore } : {}),
              ...(eventStatus ? { eventStatus } : {}),
            }}]);
            ef = { ...ef, homeTeamScore: homeScore, awayTeamScore: awayScore, eventStatus };
          } catch {}
        }
      }

      // Only grade when final/post and scores present
      const isFinal = eventStatus === 'final' || eventStatus === 'post' || eventStatus === 'postponed' || eventStatus === 'completed';
      if (!isFinal || homeScore == null || awayScore == null) {
        console.log(`⏭️  [gradeMoneylineProps] Skip event ${eventId} (status=${eventStatus || 'unknown'}, scores=${homeScore}-${awayScore})`);
        continue;
      }

      // Determine winner role
      let winnerRole = null; // "home" | "away" | "tie"
      if (homeScore > awayScore) winnerRole = "home";
      else if (awayScore > homeScore) winnerRole = "away";
      else winnerRole = "tie";

      // Resolve team names
      let homeName = Array.isArray(ef.homeTeam) ? ef.homeTeam[0] : ef.homeTeam || null;
      let awayName = Array.isArray(ef.awayTeam) ? ef.awayTeam[0] : ef.awayTeam || null;
      if (!homeName && Array.isArray(ef.homeTeamLink) && ef.homeTeamLink.length) {
        homeName = await getTeamNameByRecordId(ef.homeTeamLink[0]);
      }
      if (!awayName && Array.isArray(ef.awayTeamLink) && ef.awayTeamLink.length) {
        awayName = await getTeamNameByRecordId(ef.awayTeamLink[0]);
      }

      // Compose propResult string
      let propResult = "";
      if (winnerRole === "home") {
        propResult = `${homeName || "Home"} beat ${awayName || "Away"} ${homeScore}-${awayScore}`;
      } else if (winnerRole === "away") {
        propResult = `${awayName || "Away"} beat ${homeName || "Home"} ${awayScore}-${homeScore}`;
      } else {
        propResult = `${awayName || "Away"} and ${homeName || "Home"} tied ${awayScore}-${homeScore}`;
      }

      console.log(
        `🏟️ [gradeMoneylineProps] Event ${eventId} → ${awayName || 'Away'} @ ${homeName || 'Home'} | ` +
        `score ${awayScore}-${homeScore} | winner=${winnerRole} | result="${propResult}"`
      );

      // 2a) Match props by ESPN ID: Props.propESPNLookup == Events.espnGameID (fallback tries ARRAYJOIN)
      if (!espnId) {
        console.log(`🧩 [gradeMoneylineProps] Event ${eventId} missing espnGameID; skipping prop match`);
        continue;
      }
      const espnIdLiteral = espnId.replace(/"/g, '');
      // Coerce propESPNLookup to string for strict compare; then fallbacks
      let matchedProps = await base("Props")
        .select({
          filterByFormula: `TRIM({propESPNLookup} & "") = "${espnIdLiteral}"`,
        })
        .all();
      if (matchedProps.length === 0) {
        matchedProps = await base("Props")
          .select({
            filterByFormula: `{propESPNLookup} = "${espnIdLiteral}"`,
          })
          .all();
      }
      if (matchedProps.length === 0) {
        matchedProps = await base("Props")
          .select({
            filterByFormula: `FIND("${espnIdLiteral}", ARRAYJOIN({propESPNLookup}))>0`,
          })
          .all();
      }

      if (matchedProps.length === 0) {
        console.log(`🧩 [gradeMoneylineProps] No props matched by propESPNLookup=${espnIdLiteral} for event ${eventId}`);
        continue;
      }

      const selectedProps = matchedProps.filter((p) => {
        const f = p.fields || {};
        const status = String(f.propStatus || '').toLowerCase();
        const typeVal = String(f.propType || '').toLowerCase();
        const hasMoneylines = (f.PropSideAMoneyline !== undefined && f.PropSideAMoneyline !== null)
          && (f.PropSideBMoneyline !== undefined && f.PropSideBMoneyline !== null);
        const valueModel = String(f.propValueModel || '').toLowerCase();
        const typeMatches = typeVal === 'moneyline' || hasMoneylines || valueModel === 'vegas';
        const statusMatches = status === 'open' || status === 'closed';
        return typeMatches && statusMatches;
      });

      console.log(`🧩 [gradeMoneylineProps] propESPNLookup=${espnIdLiteral} matched=${matchedProps.length}, eligible=${selectedProps.length} for event ${eventId}`);
      if (selectedProps.length === 0) continue;

      // 2b) Determine graded status based on winner role assuming A=away, B=home for moneyline
      let gradedStatus = "push";
      if (winnerRole === "away") gradedStatus = "gradedA";
      else if (winnerRole === "home") gradedStatus = "gradedB";

      // 2c) Stage updates
      for (const p of selectedProps) {
        const propIdField = p.fields.propID || null;
        results.push({
          airtableId: p.id,
          propID: propIdField,
          eventId,
          propShort: p.fields.propShort || "",
          fromStatus: p.fields.propStatus || "",
          toStatus: gradedStatus,
          propResult,
        });
        const fieldsPreview = `{ propStatus: "${gradedStatus}", propResult: "${propResult}" }`;
        console.log(
          `✏️ [gradeMoneylineProps] ${dryRun ? 'Stage' : 'Update'} Props record ${p.id}` +
          (propIdField ? ` (propID=${propIdField})` : ``) +
          ` for event ${eventId} | ${String(p.fields.propStatus || '')} → ${gradedStatus} | fields=${fieldsPreview}`
        );
        if (!dryRun) {
          updates.push({ id: p.id, fields: { propStatus: gradedStatus, propResult } });
        }
      }
    }

    // 3) Apply updates in chunks
    if (!dryRun && updates.length > 0) {
      const chunkSize = 10;
      for (let i = 0; i < updates.length; i += chunkSize) {
        const chunk = updates.slice(i, i + chunkSize);
        // eslint-disable-next-line no-await-in-loop
        await base("Props").update(chunk);
        console.log(`📦 [gradeMoneylineProps] Wrote chunk ${i / chunkSize + 1} (${chunk.length} updates)`);
      }
    }

    console.log(
      `✅ [gradeMoneylineProps] Done. dryRun=${dryRun} | affected=${results.length} | ` +
      (dryRun ? `updated=0` : `updated=${updates.length}`)
    );

    return res.status(200).json({
      success: true,
      dryRun,
      updatedCount: dryRun ? 0 : updates.length,
      affectedCount: results.length,
      results,
    });
  } catch (error) {
    console.error("🚨 [gradeMoneylineProps] Error:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
}


