import { useState, useEffect } from 'react';

/**
 * useDayLeaderboard
 * Fetches day-based leaderboard data from the API endpoint.
 * @param {string} day - The day to fetch leaderboard for ('today', 'yesterday', 'tomorrow', 'thisWeek', 'nextWeek')
 * @returns {{ leaderboard: Array, loading: boolean, error: string, dayLabel: string }}
 */
export default function useDayLeaderboard(day = 'today', packIds = [], teamSlug = '') {
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [dayLabel, setDayLabel] = useState('');

  useEffect(() => {
    let isMounted = true;
    async function fetchLeaderboard() {
      setLoading(true);
      setError('');
      
      try {
        const params = new URLSearchParams();
        if (day) params.append('day', day);
        if (Array.isArray(packIds) && packIds.length > 0) {
          params.append('packIds', packIds.join(','));
        }
        if (teamSlug) params.append('teamSlug', teamSlug);
        try {
          // eslint-disable-next-line no-console
          console.log('[useDayLeaderboard] Fetching with params =>', params.toString());
        } catch {}
        const res = await fetch(`/api/leaderboard/day?${params.toString()}`);
        const data = await res.json();
        
        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Failed to fetch day leaderboard');
        }
        
        if (isMounted) {
          setLeaderboard(data.leaderboard || []);
          setDayLabel(data.dayLabel || '');
        }
        try {
          // eslint-disable-next-line no-console
          console.log('[useDayLeaderboard] Received =>', { count: (data.leaderboard || []).length, day: data.day, dayLabel: data.dayLabel });
        } catch {}
      } catch (err) {
        if (isMounted) setError(err.message);
        try { console.warn('[useDayLeaderboard] error =>', err?.message || err); } catch {}
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    
    fetchLeaderboard();
    return () => {
      isMounted = false;
    };
  }, [day, Array.isArray(packIds) ? packIds.join(',') : '', teamSlug]);

  return { leaderboard, loading, error, dayLabel };
}
