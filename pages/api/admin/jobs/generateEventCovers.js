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
    const date = params.date; // YYYY-MM-DD
    const leagueRaw = params.league || "";
    const tz = params.tz || null; // IANA timezone, e.g. "America/New_York"

    if (!date || !leagueRaw) {
      return res.status(400).json({ success: false, error: "Missing required params: date, league" });
    }

    const league = String(leagueRaw).toLowerCase();
    const dateFormula = tz
      ? `DATETIME_FORMAT(SET_TIMEZONE({eventTime}, "${tz}"), 'YYYY-MM-DD') = "${date}"`
      : `DATETIME_FORMAT({eventTime}, 'YYYY-MM-DD') = "${date}"`;

    console.log(`🎨 [generateEventCovers] Start → date=${date}, league=${league}, tz=${tz || 'unset'}`);
    const events = await base("Events")
      .select({
        filterByFormula: `AND(${dateFormula}, LOWER({eventLeague}) = "${league}")`,
        pageSize: 100,
      })
      .all();
    console.log(`🎯 [generateEventCovers] Found ${events.length} events for ${date} (${league})`);
    const results = [];
    let updatedCount = 0;

    // Helper to get first attachment URL from an Airtable attachment or lookup field
    function getFirstAttachmentUrl(fieldVal) {
      try {
        if (Array.isArray(fieldVal) && fieldVal.length > 0) {
          // Find the first entry that has a URL
          for (const entry of fieldVal) {
            if (entry && typeof entry === 'object') {
              if (typeof entry.url === 'string' && entry.url.startsWith('http')) return entry.url;
              // Some lookups may place URL under thumbnails.large.url
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

    for (const evt of events) {
      const f = evt.fields || {};
      const eventId = evt.id;
      const awayUrl = getFirstAttachmentUrl(f.teamAwaySide);
      const homeUrl = getFirstAttachmentUrl(f.teamHomeSide);
      console.log(`[generateEventCovers] Event ${eventId}: attachments → away=${!!awayUrl}, home=${!!homeUrl}`);

      if (!awayUrl || !homeUrl) {
        console.log(`[generateEventCovers] Skip ${eventId} (missing attachment)`);
        results.push({ eventId, status: 'skipped', reason: 'missing attachment(s)', awayUrl: !!awayUrl, homeUrl: !!homeUrl });
        continue;
      }

      try {
        // Load images
        const [awayImg, homeImg] = await Promise.all([loadImage(awayUrl), loadImage(homeUrl)]);

        // Create a single square canvas and layer images directly on top of each other
        const sideSize = 1024; // enforce 1:1 output at higher resolution
        const canvas = createCanvas(sideSize, sideSize);
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, sideSize, sideSize);
        ctx.imageSmoothingQuality = 'high';
        // Draw away first, then home on top (assumption: home should appear above away)
        ctx.drawImage(awayImg, 0, 0, sideSize, sideSize);
        ctx.drawImage(homeImg, 0, 0, sideSize, sideSize);

        const pngBuffer = canvas.toBuffer('image/png');

        // Upload to Firebase Storage
        const folder = 'event-covers';
        // Use timestamp in filename to avoid CDN/browser cache collisions
        const filename = `${eventId}-${Date.now()}.png`;
        const firebasePath = `${folder}/${filename}`;
        console.log(`[generateEventCovers] Uploading ${eventId} → gs://${storageBucket.name}/${firebasePath}`);
        const file = storageBucket.file(firebasePath);
        await file.save(pngBuffer, {
          metadata: { contentType: 'image/png' },
          public: true,
          resumable: false,
        });
        const publicUrl = `https://storage.googleapis.com/${storageBucket.name}/${firebasePath}`;

        // Update Airtable eventCover attachment with the new URL
        await base('Events').update([
          {
            id: eventId,
            fields: { eventCover: [{ url: publicUrl }] },
          },
        ]);

        updatedCount += 1;
        console.log(`[generateEventCovers] Updated ${eventId} eventCover → ${publicUrl}`);
        results.push({ eventId, status: 'updated', url: publicUrl });
      } catch (err) {
        console.error('[generateEventCovers] Error processing event', eventId, err);
        results.push({ eventId, status: 'error', error: err?.message || 'unknown' });
      }
    }
    console.log(`✅ [generateEventCovers] Done. updated=${updatedCount}/${events.length} for ${date} (${league})`);
    return res.status(200).json({ success: true, count: events.length, updatedCount, results });
  } catch (error) {
    console.error("[generateEventCovers] Error:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
}


