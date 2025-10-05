import { getToken } from 'next-auth/jwt';
import Airtable from 'airtable';
import { getDataBackend } from '../../../../../lib/runtimeConfig';
import { query } from '../../../../../lib/db/postgres';
import { storageBucket } from '../../../../../lib/firebaseAdmin';
import { createCanvas, loadImage } from 'canvas';

export default async function handler(req, res) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { eventId } = req.query;
  try { console.log('[admin/generateCover] Request start', { eventId }); } catch {}
  if (!eventId) {
    return res.status(400).json({ success: false, error: 'Missing eventId parameter' });
  }

  try {
    const backend = getDataBackend();

    // Helper: draw composite square image (away under, home over)
    const composeCoverPng = async (awayUrl, homeUrl) => {
      const sideSize = 1024;
      const canvas = createCanvas(sideSize, sideSize);
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, sideSize, sideSize);
      ctx.imageSmoothingQuality = 'high';
      const [awayImg, homeImg] = await Promise.all([loadImage(awayUrl), loadImage(homeUrl)]);
      ctx.drawImage(awayImg, 0, 0, sideSize, sideSize);
      ctx.drawImage(homeImg, 0, 0, sideSize, sideSize);
      return canvas.toBuffer('image/png');
    };

    // Helper: upload to Firebase Storage and return public URL
    const uploadBuffer = async (eventIdForName, pngBuffer) => {
      const folder = 'event-covers';
      const filename = `${eventIdForName}-${Date.now()}.png`;
      const firebasePath = `${folder}/${filename}`;
      const file = storageBucket.file(firebasePath);
      await file.save(pngBuffer, {
        metadata: { contentType: 'image/png' },
        public: true,
        resumable: false,
      });
      const publicUrl = `https://storage.googleapis.com/${storageBucket.name}/${firebasePath}`;
      return publicUrl;
    };

    if (backend === 'postgres') {
      // Fetch team side attachments for the event (home uses team_home_side, away uses team_away_side)
      const { rows } = await query(
        `SELECT e.id,
                ht.team_home_side AS "homeSide",
                at.team_away_side AS "awaySide"
           FROM events e
      LEFT JOIN teams ht ON e.home_team_id = ht.id
      LEFT JOIN teams at ON e.away_team_id = at.id
          WHERE e.id::text = $1 OR e.event_id = $1 OR e.espn_game_id = $1
          LIMIT 1`,
        [eventId]
      );
      if (!rows || rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Event not found' });
      }
      const r = rows[0];
      const getFirstAttachmentUrl = (val) => {
        try {
          if (Array.isArray(val) && val.length) {
            const first = val[0];
            if (first && typeof first === 'object' && first.url) return first.url;
            if (typeof first === 'string') return first;
          }
          if (val && typeof val === 'object' && val.url) return val.url;
        } catch {}
        return null;
      };
      const homeUrl = getFirstAttachmentUrl(r.homeSide);
      const awayUrl = getFirstAttachmentUrl(r.awaySide);
      try { console.log('[admin/generateCover] Resolved team sides', { eventInternalId: r.id, hasHomeUrl: !!homeUrl, hasAwayUrl: !!awayUrl }); } catch {}
      if (!homeUrl || !awayUrl) {
        return res.status(400).json({ success: false, error: 'Missing team side images for this event' });
      }
      try { console.log('[admin/generateCover] Composing PNG', { eventInternalId: r.id }); } catch {}
      const pngBuffer = await composeCoverPng(awayUrl, homeUrl);
      try { console.log('[admin/generateCover] Uploading PNG to Firebase', { eventInternalId: r.id, bucket: storageBucket?.name }); } catch {}
      const publicUrl = await uploadBuffer(r.id, pngBuffer);
      try { console.log('[admin/generateCover] Uploaded', { eventInternalId: r.id, publicUrl }); } catch {}

      // Persist to DB if column exists
      try {
        await query('UPDATE events SET cover_url = $1 WHERE id = $2', [publicUrl, r.id]);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('[generateCover] Failed to update events.cover_url =>', e);
      }

      // Return updated event payload (align with GET shape)
      let updatedRows;
      try {
        ({ rows: updatedRows } = await query(
          `SELECT e.id,
                  e.title AS "eventTitle",
                  e.event_time AS "eventTime",
                  e.league AS "eventLeague",
                  e.cover_url AS "eventCoverURL",
                  e.home_team_id,
                  e.away_team_id
             FROM events e
            WHERE e.id = $1
            LIMIT 1`,
          [r.id]
        ));
      } catch {
        updatedRows = [];
      }
      const ev = (updatedRows && updatedRows[0]) || null;
      const event = ev
        ? {
            id: ev.id,
            eventTitle: ev.eventTitle,
            eventTime: ev.eventTime,
            eventLeague: ev.eventLeague,
            eventCover: ev.eventCoverURL ? [{ url: ev.eventCoverURL }] : [],
            homeTeamLink: ev.home_team_id ? [ev.home_team_id] : [],
            awayTeamLink: ev.away_team_id ? [ev.away_team_id] : [],
          }
        : null;

      try { console.log('[admin/generateCover] Success response', { eventInternalId: r.id, url: publicUrl }); } catch {}
      return res.status(200).json({ success: true, url: publicUrl, event });
    }

    // Airtable backend
    const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);
    let rec;
    try {
      rec = await base('Events').find(eventId);
    } catch (e) {
      return res.status(404).json({ success: false, error: 'Event not found in Airtable' });
    }
    const f = rec.fields || {};
    const getFirstAttachmentUrl = (fieldVal) => {
      try {
        if (Array.isArray(fieldVal) && fieldVal.length) {
          const first = fieldVal[0];
          if (first && typeof first === 'object' && first.url) return first.url;
          if (typeof first === 'string') return first;
        }
      } catch {}
      return null;
    };
    const awayUrl = getFirstAttachmentUrl(f.teamAwaySide);
    const homeUrl = getFirstAttachmentUrl(f.teamHomeSide);
    try { console.log('[admin/generateCover] [Airtable] Resolved team sides', { eventId: rec.id, hasHomeUrl: !!homeUrl, hasAwayUrl: !!awayUrl }); } catch {}
    if (!awayUrl || !homeUrl) {
      return res.status(400).json({ success: false, error: 'Missing attachments for teamAwaySide or teamHomeSide' });
    }
    try { console.log('[admin/generateCover] [Airtable] Composing PNG', { eventId: rec.id }); } catch {}
    const pngBuffer = await composeCoverPng(awayUrl, homeUrl);
    try { console.log('[admin/generateCover] [Airtable] Uploading PNG to Firebase', { eventId: rec.id, bucket: storageBucket?.name }); } catch {}
    const publicUrl = await uploadBuffer(rec.id, pngBuffer);
    try { console.log('[admin/generateCover] [Airtable] Uploaded', { eventId: rec.id, publicUrl }); } catch {}

    // Update Airtable attachment field eventCover
    try {
      await base('Events').update([
        { id: rec.id, fields: { eventCover: [{ url: publicUrl }] } },
      ]);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[generateCover] Failed to update Airtable eventCover =>', e);
    }

    // Fetch updated event via existing service shape if desired by client
    try { console.log('[admin/generateCover] [Airtable] Success response', { eventId: rec.id, url: publicUrl }); } catch {}
    return res.status(200).json({ success: true, url: publicUrl });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[api/admin/events/[eventId]/generateCover] Error =>', error);
    return res.status(500).json({ success: false, error: 'Failed to generate cover' });
  }
}


