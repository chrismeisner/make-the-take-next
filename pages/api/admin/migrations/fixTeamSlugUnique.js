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
    // Drop global unique constraint on team_slug if it exists, replace with case-insensitive uniqueness per (league, team_slug)
    // Use transactional DDL for safety where possible
    await query('BEGIN');
    // Attempt to drop the default constraint name; ignore if missing
    await query('ALTER TABLE teams DROP CONSTRAINT IF EXISTS teams_team_slug_key');
    // Create composite unique index on UPPER(league), UPPER(team_slug)
    await query('CREATE UNIQUE INDEX IF NOT EXISTS uniq_teams_league_slug_ci ON teams (UPPER(league), UPPER(team_slug))');
    // Add supporting index on league (already exists via idx_teams_league in schema) — skip if present
    await query('COMMIT');
    return res.status(200).json({ success: true, message: 'Updated uniqueness: team_slug is now unique per league (case-insensitive).' });
  } catch (err) {
    try { await query('ROLLBACK'); } catch {}
    return res.status(500).json({ success: false, error: err?.message || String(err) });
  }
}


