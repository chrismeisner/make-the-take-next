import { useState, useEffect } from 'react';

/**
 * useAllTimeLeaderboard
 * Fetches all-time leaderboard data from the API endpoint.
 * Optionally scope by packIds to match currently visible packs.
 */
export default function useAllTimeLeaderboard(packIds = [], teamSlug = '') {
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let isMounted = true;
    async function fetchLeaderboard() {
      setLoading(true);
      setError('');
      try {
        const params = new URLSearchParams();
        if (Array.isArray(packIds) && packIds.length > 0) {
          params.append('packIds', packIds.join(','));
        }
        if (teamSlug) params.append('teamSlug', teamSlug);
        const res = await fetch(`/api/leaderboard/all-time?${params.toString()}`);
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Failed to fetch all-time leaderboard');
        }
        if (isMounted) setLeaderboard(data.leaderboard || []);
      } catch (err) {
        if (isMounted) setError(err.message);
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    fetchLeaderboard();
    return () => { isMounted = false; };
  }, [Array.isArray(packIds) ? packIds.join(',') : '', teamSlug]);

  return { leaderboard, loading, error };
}


