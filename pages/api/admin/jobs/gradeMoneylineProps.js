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
  return res.status(410).json({ success: false, error: 'Auto grading disabled' });
}


