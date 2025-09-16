import { query } from '../../../../lib/db/postgres';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const providedKey = req.headers['x-cron-key'] || req.query.key;
  const expectedKey = process.env.CRON_SECRET;
  if (!expectedKey || providedKey !== expectedKey) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  // Require Postgres backend for this job
  const backend = String(process.env.DATA_BACKEND || 'airtable').toLowerCase();
  if (backend !== 'postgres') {
    return res.status(400).json({ success: false, error: 'DATA_BACKEND must be postgres to run this job' });
  }

  try {
    // Open packs when: NOW >= pack_open_time AND (no close_time OR NOW < close_time)
    const openSql = `
      UPDATE packs
         SET pack_status = 'active'
       WHERE pack_open_time IS NOT NULL
         AND NOW() >= pack_open_time
         AND (
               pack_close_time IS NULL
            OR NOW() < (pack_close_time::timestamptz)
         )
         AND COALESCE(LOWER(pack_status), '') NOT IN ('active','closed','graded','completed')
      RETURNING id, pack_url`;
    const { rows: opened } = await query(openSql);

    // Close packs when: NOW >= pack_close_time
    const closeSql = `
      UPDATE packs
         SET pack_status = 'closed'
       WHERE pack_close_time IS NOT NULL
         AND NOW() >= (pack_close_time::timestamptz)
         AND COALESCE(LOWER(pack_status), '') NOT IN ('closed','graded','completed')
      RETURNING id, pack_url`;
    const { rows: closed } = await query(closeSql);

    try {
      console.log('[autoOpenClosePacks] DONE', { opened: opened.length, closed: closed.length });
    } catch {}

    return res.status(200).json({ success: true, openedCount: opened.length, closedCount: closed.length });
  } catch (error) {
    try {
      console.error('[autoOpenClosePacks] ERROR', { message: error?.message });
    } catch {}
    return res.status(500).json({ success: false, error: error.message });
  }
}





