import { getToken } from 'next-auth/jwt';
import { query } from '../../../../lib/db/postgres';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  try {
    await query('BEGIN');
    // Ensure column exists
    await query('ALTER TABLE events ADD COLUMN IF NOT EXISTS event_id TEXT');
    // Create a unique constraint on event_id if missing
    await query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM information_schema.table_constraints
          WHERE table_name = 'events'
            AND constraint_type = 'UNIQUE'
            AND constraint_name = 'events_event_id_key'
        ) THEN
          ALTER TABLE events ADD CONSTRAINT events_event_id_key UNIQUE (event_id);
        END IF;
      END $$;
    `);
    await query('COMMIT');
    return res.status(200).json({ success: true, message: 'Unique constraint ensured on events.event_id' });
  } catch (err) {
    try { await query('ROLLBACK'); } catch {}
    return res.status(500).json({ success: false, error: err?.message || String(err) });
  }
}


