import { useState, useMemo } from 'react';
import LeaderboardTable from './LeaderboardTable';
import useDayLeaderboard from '../hooks/useDayLeaderboard';
import { computeAvailableDays, getPackIdsForDay, getDayLabels } from '../lib/dayGrouping';

export default function DayBasedLeaderboard({ packs = [], selectedDay = 'today', selectedDate = null, accent = 'blue', teamSlug = '' }) {
  
  // Determine which days have packs (shared util)
  const availableDays = useMemo(() => computeAvailableDays(packs, { selectedDateIso: selectedDate, teamSlug }), [packs, selectedDate, teamSlug]);

  // If no packs available, don't show anything
  if (availableDays.length === 0) {
    return null;
  }

  // Use the selected day if it has packs, otherwise use the first available day
  const currentSelectedDay = availableDays.includes(selectedDay) ? selectedDay : availableDays[0];

  // Compute the pack IDs that belong to the currentSelectedDay (shared util)
  const dayPackIds = useMemo(() => getPackIdsForDay(packs, currentSelectedDay, { selectedDateIso: selectedDate, teamSlug }), [packs, currentSelectedDay, selectedDate, teamSlug]);

  const { leaderboard, loading, error, dayLabel } = useDayLeaderboard(currentSelectedDay, dayPackIds, teamSlug);

  // Debug logs
  try {
    // eslint-disable-next-line no-console
    console.log('[DayBasedLeaderboard] selectedDay =>', { selectedDay, currentSelectedDay });
    // eslint-disable-next-line no-console
    console.log('[DayBasedLeaderboard] dayPackIds =>', dayPackIds);
    // eslint-disable-next-line no-console
    console.log('[DayBasedLeaderboard] leaderboard state =>', { loading, error, count: leaderboard.length });
  } catch {}

  const dayLabels = getDayLabels();

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
