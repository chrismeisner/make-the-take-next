// File: pages/api/leaderboard/all-time.js
import { getLeaderboard } from '../../../lib/dal/postgres/leaderboard';

export default async function handler(req, res) {
  const { limit: limitParam, packIds: packIdsParam, teamSlug: teamSlugParam } = req.query;

  try {
    const limit = Math.min(Number.parseInt(limitParam || '100', 10), 500);
    const packIds = String(packIdsParam || '').split(',').map((s) => s.trim()).filter(Boolean);
    const teamSlug = (teamSlugParam || '').toString().trim();

    const leaderboard = await getLeaderboard({ teamSlug, packIds, limit });
    return res.status(200).json({ success: true, leaderboard });
  } catch (err) {
    console.error('[all-time leaderboard] Error =>', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}


