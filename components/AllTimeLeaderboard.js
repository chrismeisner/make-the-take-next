import LeaderboardTable from './LeaderboardTable';
import useAllTimeLeaderboard from '../hooks/useAllTimeLeaderboard';
import { useMemo } from 'react';
import { getPackIdentifier } from '../lib/dayGrouping';

export default function AllTimeLeaderboard({ packs = [], selectedDate = null, teamSlug = '' }) {
  // Scope by ALL packs provided to the page (team or series), not just visible days
  const allPackIds = useMemo(() => {
    const ids = new Set();
    (Array.isArray(packs) ? packs : []).forEach((p) => {
      const id = getPackIdentifier(p);
      if (id) ids.add(id);
    });
    return Array.from(ids);
  }, [packs]);

  const { leaderboard, loading, error } = useAllTimeLeaderboard(allPackIds, teamSlug);

  return (
    <div className="space-y-4">
      <div className="border-b border-gray-200 pb-2">
        <h2 className="text-xl font-bold text-gray-900">All-Time Leaderboard</h2>
        <p className="text-sm text-gray-600 mt-1">
          {loading ? 'Loading...' : `${leaderboard.length} participant${leaderboard.length !== 1 ? 's' : ''}`}
        </p>
      </div>

      {error && (
        <div className="text-red-600 text-sm">Error: {error}</div>
      )}

      {!loading && !error && (
        <LeaderboardTable leaderboard={leaderboard} packSlugOrId={null} />
      )}

      {loading && (
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto"></div>
          <p className="text-gray-500 mt-2">Loading leaderboard...</p>
        </div>
      )}

      {!loading && !error && leaderboard.length === 0 && (
        <div className="text-center py-8">
          <p className="text-gray-500">No participants yet.</p>
        </div>
      )}
    </div>
  );
}


