import { useState, useMemo } from 'react';
import LeaderboardTable from './LeaderboardTable';
import useDayLeaderboard from '../hooks/useDayLeaderboard';

export default function DayBasedLeaderboard({ packs = [], selectedDay = 'today', accent = 'blue' }) {
  
  // Determine which days have packs
  const availableDays = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const dayGroups = {
      today: [],
      yesterday: [],
      tomorrow: [],
      thisWeek: [],
      nextWeek: [],
      later: []
    };

    const getDateGroup = (pack) => {
      const eventTime = pack?.eventTime || pack?.packOpenTime || pack?.packCloseTime;
      if (!eventTime) return 'later';
      
      try {
        const eventDate = new Date(eventTime);
        eventDate.setHours(0, 0, 0, 0);
        
        const todayDate = new Date(today);
        const diffTime = eventDate.getTime() - todayDate.getTime();
        const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
        
        if (diffDays === 0) return 'today';
        if (diffDays === -1) return 'yesterday';
        if (diffDays === 1) return 'tomorrow';
        if (diffDays >= 2 && diffDays <= 7) return 'thisWeek';
        if (diffDays >= 8 && diffDays <= 14) return 'nextWeek';
        return 'later';
      } catch {
        return 'later';
      }
    };

    packs.forEach(pack => {
      const group = getDateGroup(pack);
      dayGroups[group].push(pack);
    });

    return Object.entries(dayGroups)
      .filter(([_, packs]) => packs.length > 0)
      .map(([day, _]) => day);
  }, [packs]);

  // If no packs available, don't show anything
  if (availableDays.length === 0) {
    return null;
  }

  // Use the selected day if it has packs, otherwise use the first available day
  const currentSelectedDay = availableDays.includes(selectedDay) ? selectedDay : availableDays[0];
  
  const { leaderboard, loading, error, dayLabel } = useDayLeaderboard(currentSelectedDay);

  const dayLabels = {
    today: "Today",
    yesterday: "Yesterday", 
    tomorrow: "Tomorrow",
    thisWeek: "This Week",
    nextWeek: "Next Week",
    later: "Later"
  };

  return (
    <div className="space-y-4">
      {/* Leaderboard title */}
      <div className="border-b border-gray-200 pb-2">
        <h2 className="text-xl font-bold text-gray-900">
          {dayLabel || dayLabels[currentSelectedDay]} Leaderboard
        </h2>
        <p className="text-sm text-gray-600 mt-1">
          {loading ? 'Loading...' : `${leaderboard.length} participant${leaderboard.length !== 1 ? 's' : ''}`}
        </p>
      </div>

      {/* Error state */}
      {error && (
        <div className="text-red-600 text-sm">
          Error: {error}
        </div>
      )}

      {/* Leaderboard table */}
      {!loading && !error && (
        <LeaderboardTable leaderboard={leaderboard} />
      )}

      {/* Loading state */}
      {loading && (
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto"></div>
          <p className="text-gray-500 mt-2">Loading leaderboard...</p>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && leaderboard.length === 0 && (
        <div className="text-center py-8">
          <p className="text-gray-500">No participants yet for {dayLabels[currentSelectedDay].toLowerCase()}.</p>
          <p className="text-gray-400 text-sm mt-1">Be the first to make a take!</p>
        </div>
      )}
    </div>
  );
}
