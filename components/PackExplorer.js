import { useMemo, useState } from 'react';
import PackPreview from './PackPreview';

/**
 * PackExplorer
 * - Reusable pack list with dashboard-identical sort/filter controls
 * - Expects `packs` from server/API (already filtered to active/graded by API)
 */
export default function PackExplorer({
  packs = [],
  initialSort = 'eventTimeDesc', // 'eventTimeAsc' | 'eventTimeDesc'
  initialHideGraded = false,
  initialTimeFilter = 'thisWeek', // 'today' | 'thisWeek' | 'thisMonth' | 'allTime'
}) {
  const [sortOption, setSortOption] = useState(initialSort);
  const [hideGraded, setHideGraded] = useState(initialHideGraded);
  const [timeFilter, setTimeFilter] = useState(initialTimeFilter);

  function getMinEventTime(pack) {
    const times = Array.isArray(pack.propEventRollup) ? pack.propEventRollup : [];
    if (times.length > 0) return Math.min(...times.map((t) => new Date(t).getTime()));
    return pack.eventTime ? new Date(pack.eventTime).getTime() : Number.POSITIVE_INFINITY;
  }

  const sortedPacks = useMemo(() => {
    if (sortOption === 'eventTimeAsc') {
      return [...packs].sort((a, b) => getMinEventTime(a) - getMinEventTime(b));
    }
    if (sortOption === 'eventTimeDesc') {
      return [...packs].sort((a, b) => getMinEventTime(b) - getMinEventTime(a));
    }
    return packs;
  }, [packs, sortOption]);

  const displayedPacks = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay()).getTime();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();

    return sortedPacks.filter((pack) => {
      if (hideGraded && String(pack.packStatus).toLowerCase() === 'graded') return false;
      const eventTime = getMinEventTime(pack);
      if (!isFinite(eventTime)) return true; // If no time, keep by default
      if (timeFilter === 'today') {
        return eventTime >= startOfToday && eventTime < startOfToday + 24 * 60 * 60 * 1000;
      }
      if (timeFilter === 'thisWeek') {
        return eventTime >= startOfWeek && eventTime < startOfWeek + 7 * 24 * 60 * 60 * 1000;
      }
      if (timeFilter === 'thisMonth') {
        return eventTime >= startOfMonth && eventTime < startOfNextMonth;
      }
      return true;
    });
  }, [sortedPacks, hideGraded, timeFilter]);

  return (
    <div>
      <div className="flex items-center justify-center mb-4 space-x-6">
        <label htmlFor="sortOption" className="text-sm font-medium text-gray-700">
          Sort by:
        </label>
        <select
          id="sortOption"
          value={sortOption}
          onChange={(e) => setSortOption(e.target.value)}
          className="border rounded px-2 py-1"
        >
          <option value="eventTimeAsc">Coming Up Soonest</option>
          <option value="eventTimeDesc">Latest</option>
        </select>

        <label className="inline-flex items-center">
          <input
            type="checkbox"
            className="mr-2"
            checked={hideGraded}
            onChange={() => setHideGraded((prev) => !prev)}
          />
          <span className="text-gray-700">Hide graded packs</span>
        </label>

        <label htmlFor="timeFilter" className="text-sm font-medium text-gray-700">
          Show:
        </label>
        <select
          id="timeFilter"
          value={timeFilter}
          onChange={(e) => setTimeFilter(e.target.value)}
          className="border rounded px-2 py-1"
        >
          <option value="today">Today</option>
          <option value="thisWeek">This Week</option>
          <option value="thisMonth">This Month</option>
          <option value="allTime">All Time</option>
        </select>
      </div>

      {displayedPacks.length > 0 ? (
        <div className="w-full grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {displayedPacks.map((pack) => (
            <PackPreview key={pack.packID || pack.airtableId || pack.id} pack={pack} />
          ))}
        </div>
      ) : (
        <p className="text-center">No packs to show</p>
      )}
    </div>
  );
}


