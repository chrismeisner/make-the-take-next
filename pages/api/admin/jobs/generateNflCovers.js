import Airtable from "airtable";
import { getToken } from "next-auth/jwt";
import { storageBucket } from "../../../../lib/firebaseAdmin";
import { createCanvas, loadImage } from "canvas";

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
    const params = req.query && Object.keys(req.query).length ? req.query : req.body || {};
    const year = Number(params.year);
    const week = Number(params.week);

    if (!Number.isInteger(year) || !Number.isInteger(week)) {
      return res.status(400).json({ success: false, error: "Missing or invalid params: year, week" });
    }

    // Events table: NFL events are marked with eventLeague = 'nfl'. We persist weekly imports, so
    // we infer week by fetching the same set of games the weekly importer produced: match by espnGameID
    // where eventTime falls within the selected NFL week range. To avoid complex date math here,
    // we re-use the weekly schedule source via fetchNflEvents handler logic to list expected games,
    // then filter Events by those espnGameIDs.

    // Fetch the expected weekly games to get espnGameIDs
    const rapidApiKey = process.env.RAPIDAPI_KEY;
    const rapidApiHost = process.env.RAPIDAPI_HOST || 'nfl-api1.p.rapidapi.com';
    if (!rapidApiKey) {
      return res.status(500).json({ success: false, error: 'Missing RAPIDAPI_KEY env var' });
    }
    const url = `https://${rapidApiHost}/nflschedule?year=${year}&week=${week}`;
    const resp = await fetch(url, {
      method: 'GET',
      headers: {
        'x-rapidapi-host': rapidApiHost,
        'x-rapidapi-key': rapidApiKey,
      },
    });
    if (!resp.ok) {
      throw new Error(`RapidAPI weekly schedule responded with ${resp.status}`);
    }
    const json = await resp.json();
    const games = [];
    for (const day of Object.keys(json || {})) {
      const dayGames = json[day]?.games || [];
      games.push(...dayGames);
    }
    const espnIds = new Set();
    for (const g of games) {
      const uid = g?.uid || '';
      const match = typeof uid === 'string' ? uid.match(/e:(\d+)/) : null;
      const espnGameID = (match && match[1]) || g?.id || null;
      if (espnGameID) espnIds.add(String(espnGameID));
    }

    console.log(`🎨 [generateNflCovers] Start → year=${year}, week=${week}, expected games=${espnIds.size}`);

    // Fetch Events for those espnGameIDs and eventLeague NFL
    // Airtable filterByFormula has 500 char limits; batch in chunks of ~30 IDs
    const idList = Array.from(espnIds);
    const chunkSize = 30;
    const eventRecords = [];
    for (let i = 0; i < idList.length; i += chunkSize) {
      const chunk = idList.slice(i, i + chunkSize);
      const orClause = `OR(${chunk.map(id => `{espnGameID}="${id}"`).join(',')})`;
      const filter = `AND(${orClause}, LOWER({eventLeague}) = "nfl")`;
      const recs = await base('Events').select({ filterByFormula: filter, pageSize: 100 }).all();
      eventRecords.push(...recs);
    }
    console.log(`🎯 [generateNflCovers] Found ${eventRecords.length} events for year=${year} week=${week}`);

    // Helper to get first attachment URL
    function getFirstAttachmentUrl(fieldVal) {
      try {
        if (Array.isArray(fieldVal) && fieldVal.length > 0) {
          for (const entry of fieldVal) {
            if (entry && typeof entry === 'object') {
              if (typeof entry.url === 'string' && entry.url.startsWith('http')) return entry.url;
              const thumbUrl = entry?.thumbnails?.large?.url || entry?.thumbnails?.full?.url;
              if (typeof thumbUrl === 'string' && thumbUrl.startsWith('http')) return thumbUrl;
            } else if (typeof entry === 'string' && entry.startsWith('http')) {
              return entry;
            }
          }
        }
      } catch {}
      return null;
    }

    let updatedCount = 0;
    const results = [];
    for (const evt of eventRecords) {
      const f = evt.fields || {};
      const eventId = evt.id;
      const awayUrl = getFirstAttachmentUrl(f.teamAwaySide);
      const homeUrl = getFirstAttachmentUrl(f.teamHomeSide);
      if (!awayUrl || !homeUrl) {
        results.push({ eventId, status: 'skipped', reason: 'missing attachment(s)', awayUrl: !!awayUrl, homeUrl: !!homeUrl });
        continue;
      }

      try {
        const [awayImg, homeImg] = await Promise.all([loadImage(awayUrl), loadImage(homeUrl)]);
        const sideSize = 1024;
        const canvas = createCanvas(sideSize, sideSize);
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, sideSize, sideSize);
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(awayImg, 0, 0, sideSize, sideSize);
        ctx.drawImage(homeImg, 0, 0, sideSize, sideSize);
        const pngBuffer = canvas.toBuffer('image/png');

        const folder = 'event-covers';
        const filename = `${eventId}-${Date.now()}.png`;
        const firebasePath = `${folder}/${filename}`;
        const file = storageBucket.file(firebasePath);
        await file.save(pngBuffer, {
          metadata: { contentType: 'image/png' },
          public: true,
          resumable: false,
        });
        const publicUrl = `https://storage.googleapis.com/${storageBucket.name}/${firebasePath}`;

        await base('Events').update([{ id: eventId, fields: { eventCover: [{ url: publicUrl }] } }]);
        updatedCount += 1;
        results.push({ eventId, status: 'updated', url: publicUrl });
      } catch (err) {
        results.push({ eventId, status: 'error', error: err?.message || 'unknown' });
      }
    }

    return res.status(200).json({ success: true, count: eventRecords.length, updatedCount, results, year, week });
  } catch (error) {
    console.error("[generateNflCovers] Error:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
}


