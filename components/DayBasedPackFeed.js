import { useMemo, useState } from 'react';
import PackPreview from './PackPreview';

export default function DayBasedPackFeed({ packs = [], selectedDay = 'today', accent = 'blue', hideLeagueChips = true, forceTeamSlugFilter = '' }) {
  const [sortBy, setSortBy] = useState('close-asc'); // default: pack close time, soonest first
  // Group packs by their event date
  const groupedPacks = useMemo(() => {
    const today = new Date();
    // Set to start of day to avoid timezone issues
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0]; // YYYY-MM-DD format
    
    const groups = {
      today: [],
      yesterday: [],
      tomorrow: [],
      thisWeek: [],
      nextWeek: [],
      later: []
    };

    const getDateGroup = (pack) => {
      // Try event time first, then pack open time, then pack close time
      const eventTime = pack?.eventTime || pack?.packOpenTime || pack?.packCloseTime;
      if (!eventTime) return 'later';
      
      try {
        const eventDate = new Date(eventTime);
        // Set to start of day to avoid timezone issues
        eventDate.setHours(0, 0, 0, 0);
        const eventDateStr = eventDate.toISOString().split('T')[0];
        
        // Calculate days difference
        const todayDate = new Date(todayStr);
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

    // Filter packs by team if needed
    const teamFilterLc = (forceTeamSlugFilter || '').toString().toLowerCase().trim();
    const filteredPacks = teamFilterLc 
      ? packs.filter((p) => {
          const h = (p?.homeTeamSlug || '').toString().toLowerCase();
          const a = (p?.awayTeamSlug || '').toString().toLowerCase();
          return h === teamFilterLc || a === teamFilterLc;
        })
      : packs;

    // Group packs by date
    filteredPacks.forEach(pack => {
      const group = getDateGroup(pack);
      groups[group].push(pack);
    });

    // Sort packs within each group by status and close time
    const statusRank = (p) => {
      const sRaw = String(p?.packStatus || '').toLowerCase();
      const s = sRaw.replace(/\s+/g, '-');
      if (s === 'open' || s === 'active') return 0;
      if (s === 'coming-soon' || s === 'coming-up') return 1;
      if (s === 'closed' || s === 'live') return 2;
      if (s === 'completed') return 3;
      if (s === 'graded') return 4;
      return 5;
    };

    const getCloseMs = (p) => {
      const ms = new Date(p?.packCloseTime).getTime();
      return Number.isFinite(ms) ? ms : Number.POSITIVE_INFINITY;
    };

    Object.keys(groups).forEach(groupKey => {
      groups[groupKey].sort((a, b) => {
        const sr = statusRank(a) - statusRank(b);
        if (sr !== 0) return sr;
        return getCloseMs(a) - getCloseMs(b);
      });
    });

    return groups;
  }, [packs, forceTeamSlugFilter]);

  const getGroupTitle = (groupKey) => {
    const titles = {
      today: "Today's Packs",
      yesterday: "Yesterday's Packs", 
      tomorrow: "Tomorrow's Packs",
      thisWeek: "This Week",
      nextWeek: "Next Week",
      later: "Later"
    };
    return titles[groupKey] || groupKey;
  };

  const getGroupDescription = (groupKey) => {
    const descriptions = {
      today: "Packs with events happening today",
      yesterday: "Packs with events that happened yesterday",
      tomorrow: "Packs with events happening tomorrow",
      thisWeek: "Packs with events this week",
      nextWeek: "Packs with events next week", 
      later: "Packs with events further out"
    };
    return descriptions[groupKey] || '';
  };

  // Show only the selected day's packs
  const selectedDayPacks = useMemo(() => {
    const packs = groupedPacks[selectedDay] || [];
    
    // Sort packs based on sortBy setting
    const parseToMs = (val) => {
      if (val == null) return NaN;
      if (typeof val === 'number') return Number.isFinite(val) ? val : NaN;
      if (typeof val === 'string') {
        const trimmed = val.trim();
        if (/^\d{11,}$/.test(trimmed)) {
          const n = Number(trimmed);
          return Number.isFinite(n) ? n : NaN;
        }
        const ms = new Date(trimmed).getTime();
        return Number.isFinite(ms) ? ms : NaN;
      }
      try {
        const ms = new Date(val).getTime();
        return Number.isFinite(ms) ? ms : NaN;
      } catch { return NaN; }
    };

    const getCloseMs = (p) => {
      const raw = p?.packCloseTime ?? p?.pack_close_time ?? null;
      const ms = parseToMs(raw);
      return Number.isFinite(ms) ? ms : Number.POSITIVE_INFINITY;
    };

    const getOpenMs = (p) => {
      const raw = p?.packOpenTime ?? p?.pack_open_time ?? null;
      const ms = parseToMs(raw);
      return Number.isFinite(ms) ? ms : Number.NEGATIVE_INFINITY;
    };

    const arr = Array.isArray(packs) ? packs.slice() : [];
    switch (sortBy) {
      case 'close-asc':
        return arr.sort((a, b) => getCloseMs(a) - getCloseMs(b));
      case 'close-desc':
        return arr.sort((a, b) => getCloseMs(b) - getCloseMs(a));
      case 'open-desc':
        return arr.sort((a, b) => getOpenMs(b) - getOpenMs(a));
      case 'created-desc': {
        const getCreatedMs = (p) => parseToMs(p?.createdAt ?? p?.created_at ?? null);
        return arr.sort((a, b) => getCreatedMs(b) - getCreatedMs(a));
      }
      case 'title-asc':
        return arr.sort((a, b) => String(a?.packTitle || '').localeCompare(String(b?.packTitle || '')));
      default:
        return arr;
    }
  }, [groupedPacks, selectedDay, sortBy]);

  return (
    <div className="space-y-4">
      {selectedDayPacks.length > 0 ? (
        <>
          <div className="border-b border-gray-200 pb-2">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-xl font-bold text-gray-900">
                {getGroupTitle(selectedDay)}
              </h2>
              
              {/* Sort control */}
              <div className="ml-auto">
                <label htmlFor="pack-sort" className="sr-only">Sort packs</label>
                <select
                  id="pack-sort"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="border border-gray-300 rounded px-2 py-1 text-sm"
                >
                  <option value="close-asc">Close time (soonest first)</option>
                  <option value="close-desc">Close time (latest first)</option>
                  <option value="open-desc">Open time (newest first)</option>
                  <option value="created-desc">Created (newest first)</option>
                  <option value="title-asc">Title (A→Z)</option>
                </select>
              </div>
            </div>
            <p className="text-sm text-gray-600">
              {getGroupDescription(selectedDay)} ({selectedDayPacks.length} pack{selectedDayPacks.length !== 1 ? 's' : ''})
            </p>
          </div>
          
          <div className="w-full flex flex-col gap-3 md:gap-4">
            {selectedDayPacks.map((pack, index) => (
              <PackPreview
                key={pack.packID || pack.id || pack.airtableId || index}
                index={index}
                pack={pack}
                accent={accent}
              />
            ))}
          </div>
        </>
      ) : (
        <div className="text-center py-12">
          <p className="text-gray-500 text-lg">No packs found for {getGroupTitle(selectedDay).toLowerCase()}</p>
          <p className="text-gray-400 text-sm mt-2">
            {forceTeamSlugFilter ? `No packs found for team: ${forceTeamSlugFilter}` : 'Check back later for new packs!'}
          </p>
        </div>
      )}
    </div>
  );
}
