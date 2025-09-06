import { storageBucket } from '../../../lib/firebaseAdmin';
import { query } from '../../../lib/db/postgres';

export const config = {
  api: { bodyParser: { sizeLimit: '8mb' } }
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
  try {
    const { filename, fileData, eventId } = req.body || {};
    if (!filename || !fileData) {
      return res.status(400).json({ success: false, error: 'Missing filename or fileData' });
    }

    const buffer = Buffer.from(fileData, 'base64');
    const folder = 'event-covers';
    const firebasePath = `${folder}/${filename}`;
    const file = storageBucket.file(firebasePath);
    await file.save(buffer, {
      metadata: { contentType: 'image/png' },
      public: true,
      resumable: false,
    });

    const publicUrl = `https://storage.googleapis.com/${storageBucket.name}/${firebasePath}`;

    if (eventId) {
      try {
        await query('UPDATE events SET cover_url = $1 WHERE id = $2', [publicUrl, eventId]);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[api/admin/uploadEventCover] DB update failed =>', err);
        // Still return success for upload, but include warning
        return res.status(200).json({ success: true, url: publicUrl, warning: 'Uploaded, but failed to persist to DB' });
      }
    }

    return res.status(200).json({ success: true, url: publicUrl });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[api/admin/uploadEventCover] Error =>', error);
    return res.status(500).json({ success: false, error: 'Upload failed' });
  }
}

