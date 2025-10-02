// File: pages/api/leaderboard/day.js
import { getLeaderboard } from '../../../lib/dal/postgres/leaderboard';

export default async function handler(req, res) {
  const { day, limit: limitParam, packIds: packIdsParam, teamSlug: teamSlugParam } = req.query;

  try {
    const limit = Math.min(Number.parseInt(limitParam || '100', 10), 500);
    
    // Calculate date range based on day parameter
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    let startDate, endDate, dayLabel;
    
    switch (day) {
      case 'today':
        startDate = new Date(today);
        endDate = new Date(today);
        endDate.setDate(endDate.getDate() + 1);
        dayLabel = "Today's";
        break;
      case 'yesterday':
        startDate = new Date(today);
        startDate.setDate(startDate.getDate() - 1);
        endDate = new Date(today);
        dayLabel = "Yesterday's";
        break;
      case 'tomorrow':
        startDate = new Date(today);
        startDate.setDate(startDate.getDate() + 1);
        endDate = new Date(today);
        endDate.setDate(endDate.getDate() + 2);
        dayLabel = "Tomorrow's";
        break;
      case 'thisWeek':
        startDate = new Date(today);
        startDate.setDate(startDate.getDate() + 2);
        endDate = new Date(today);
        endDate.setDate(endDate.getDate() + 8);
        dayLabel = "This Week's";
        break;
      case 'nextWeek':
        startDate = new Date(today);
        startDate.setDate(startDate.getDate() + 8);
        endDate = new Date(today);
        endDate.setDate(endDate.getDate() + 15);
        dayLabel = "Next Week's";
        break;
      default:
        // Default to today
        startDate = new Date(today);
        endDate = new Date(today);
        endDate.setDate(endDate.getDate() + 1);
        dayLabel = "Today's";
    }

    // Optional pack ID filter coming from client to scope strictly to visible packs
    const packIds = String(packIdsParam || '')
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    const usePackFilter = packIds.length > 0;

    try {
      // eslint-disable-next-line no-console
      console.log('[day leaderboard] inputs =>', {
        day,
        startDate: startDate?.toISOString?.() || null,
        endDate: endDate?.toISOString?.() || null,
        usePackFilter,
        packIdsCount: packIds.length,
        limit
      });
    } catch {}

    const teamSlug = (teamSlugParam || '').toString().trim();
    const leaderboard = await getLeaderboard({
      teamSlug,
      packIds,
      startDate,
      endDate,
      limit,
    });

    try {
      // eslint-disable-next-line no-console
      console.log('[day leaderboard] results =>', { count: leaderboard.length });
    } catch {}

    return res.status(200).json({ 
      success: true, 
      leaderboard,
      dayLabel,
      day,
      packCount: 0 // We could add this if needed
    });
  } catch (err) {
    console.error('[day leaderboard] Error =>', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
