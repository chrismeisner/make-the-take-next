import { useState, useEffect } from 'react';

/**
 * useDayLeaderboard
 * Fetches day-based leaderboard data from the API endpoint.
 * @param {string} day - The day to fetch leaderboard for ('today', 'yesterday', 'tomorrow', 'thisWeek', 'nextWeek')
 * @returns {{ leaderboard: Array, loading: boolean, error: string, dayLabel: string }}
 */
export default function useDayLeaderboard(day = 'today') {
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
        const res = await fetch(`/api/leaderboard/day?day=${encodeURIComponent(day)}`);
        const data = await res.json();
        
        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Failed to fetch day leaderboard');
        }
        
        if (isMounted) {
          setLeaderboard(data.leaderboard || []);
          setDayLabel(data.dayLabel || '');
        }
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
  }, [day]);

  return { leaderboard, loading, error, dayLabel };
}
