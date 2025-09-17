import { getToken } from 'next-auth/jwt';
import { query } from '../../../lib/db/postgres';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token || !token.superAdmin) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  const backend = String(process.env.DATA_BACKEND || 'postgres').toLowerCase();
  if (backend !== 'postgres') {
    return res.status(400).json({ success: false, error: 'DATA_BACKEND must be postgres to run this job' });
  }

  try {
    try {
      console.log('[runPackStatus] START', {
        backend,
        nowIso: new Date().toISOString(),
        user: { profileID: token?.profileID || null, superAdmin: Boolean(token?.superAdmin) }
      });
    } catch {}

    const openSql = `
      UPDATE packs
         SET pack_status = 'active'
       WHERE (pack_open_time IS NOT NULL AND LENGTH(TRIM(pack_open_time::text)) > 0)
         AND NOW() >= (pack_open_time::timestamptz)
         AND (
               pack_close_time IS NULL
            OR LENGTH(TRIM(pack_close_time::text)) = 0
            OR NOW() < (pack_close_time::timestamptz)
         )
         AND COALESCE(LOWER(pack_status), '') NOT IN ('active','closed','graded','completed')
      RETURNING id, pack_url`;
    const openStart = Date.now();
    const { rows: opened } = await query(openSql);
    const openMs = Date.now() - openStart;
    try {
      console.log('[runPackStatus] OPEN phase complete', {
        durationMs: openMs,
        openedCount: opened.length,
        openedPreview: opened.slice(0, 10).map((r) => r.pack_url)
      });
    } catch {}

    const closeSql = `
      UPDATE packs
         SET pack_status = 'live'
       WHERE (pack_close_time IS NOT NULL AND LENGTH(TRIM(pack_close_time::text)) > 0)
         AND NOW() >= (pack_close_time::timestamptz)
         AND COALESCE(LOWER(pack_status), '') NOT IN ('live','graded','completed')
      RETURNING id, pack_url`;
    const closeStart = Date.now();
    const { rows: closed } = await query(closeSql);
    const closeMs = Date.now() - closeStart;
    try {
      console.log('[runPackStatus] LIVE phase complete', {
        durationMs: closeMs,
        liveCount: closed.length,
        livePreview: closed.slice(0, 10).map((r) => r.pack_url)
      });
    } catch {}

    try {
      console.log('[runPackStatus] DONE', {
        opened: opened.length,
        live: closed.length,
        totalDurationMs: undefined
      });
    } catch {}

    return res.status(200).json({ success: true, openedCount: opened.length, liveCount: closed.length });
  } catch (error) {
    try {
      console.error('[runPackStatus] ERROR', { message: error?.message, stack: error?.stack });
    } catch {}
    return res.status(500).json({ success: false, error: error.message });
  }
}


