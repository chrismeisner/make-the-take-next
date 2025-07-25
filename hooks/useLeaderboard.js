import { useState, useEffect } from 'react';

/**
 * useLeaderboard
 * Fetches leaderboard data from the appropriate API endpoint.
 * @param {Object} params
 * @param {string} [params.packURL] - If provided, fetch /api/leaderboard?packURL=...
 * @param {string} [params.contestID] - If provided, fetch /api/contests/{contestID}/leaderboard
 * @param {string} [params.subjectID] - If provided (and no contestID), fetch /api/leaderboard?subjectID=...
 * @returns {{ leaderboard: Array, loading: boolean, error: string }}
 */
export default function useLeaderboard({ packURL, contestID, subjectID } = {}) {
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let isMounted = true;
    async function fetchLeaderboard() {
      setLoading(true);
      setError('');
      let endpoint;
      if (contestID) {
        endpoint = `/api/contests/${encodeURIComponent(contestID)}/leaderboard`;
      } else {
        const params = new URLSearchParams();
        if (packURL) params.append('packURL', packURL);
        if (subjectID) params.append('subjectID', subjectID);
        endpoint = '/api/leaderboard' + (params.toString() ? `?${params.toString()}` : '');
      }

      try {
        const res = await fetch(endpoint);
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Failed to fetch leaderboard');
        }
        if (isMounted) setLeaderboard(data.leaderboard || []);
      } catch (err) {
        if (isMounted) setError(err.message);
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    fetchLeaderboard();
    return () => {
      isMounted = false;
    };
  }, [packURL, contestID, subjectID]);

  return { leaderboard, loading, error };
} 