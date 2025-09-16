import { useEffect, useMemo, useState } from 'react';
import PackPreview from './PackPreview';

export default function PackExplorer({ packs = [], accent = 'blue', hideLeagueChips = true, forceLeagueFilter = '', forceTeamSlugFilter = '' }) {
  const [selectedLeagues, setSelectedLeagues] = useState(new Set());
  const [sortBy, setSortBy] = useState('close-asc'); // default: pack close time, soonest first

  // Ensure selected leagues default to include all available leagues
  useEffect(() => {
    setSelectedLeagues((prev) => {
      const next = new Set(prev);
      if (next.size === 0) {
        // Initialize to include all leagues on first load
        leagues.forEach((lg) => next.add(lg));
      } else {
        // Add any newly-appearing leagues to the selection
        leagues.forEach((lg) => next.add(lg));
        // Optionally, remove leagues that no longer exist
        for (const lg of Array.from(next)) {
          if (!leagues.includes(lg)) next.delete(lg);
        }
      }
      return next;
    });
  }, [packs]);

  const leagues = useMemo(() => {
    const unique = new Set(
      (packs || [])
        .map((p) => (p?.packLeague || '').toString().toLowerCase())
        .filter(Boolean)
    );
    return Array.from(unique).sort();
  }, [packs]);

  const leagueFilterLc = useMemo(() => (forceLeagueFilter || '').toString().toLowerCase().trim(), [forceLeagueFilter]);
  const teamFilterLc = useMemo(() => (forceTeamSlugFilter || '').toString().toLowerCase().trim(), [forceTeamSlugFilter]);

  const visiblePacks = useMemo(() => {
    let list = packs || [];
    if (teamFilterLc) {
      list = list.filter((p) => {
        const h = (p?.homeTeamSlug || '').toString().toLowerCase();
        const a = (p?.awayTeamSlug || '').toString().toLowerCase();
        return h === teamFilterLc || a === teamFilterLc;
      });
    }
    if (leagueFilterLc) {
      list = list.filter((p) => (p?.packLeague || '').toString().toLowerCase() === leagueFilterLc);
      return list;
    }
    if (hideLeagueChips) {
      return list;
    }
    if (!selectedLeagues) return list;
    if (leagues.length > 0 && selectedLeagues.size === 0) return [];
    return list.filter((p) => {
      const lg = (p?.packLeague || '').toString().toLowerCase();
      if (!lg) return true; // Packs without a league are always visible
      return selectedLeagues.has(lg);
    });
  }, [packs, selectedLeagues, leagues, leagueFilterLc, hideLeagueChips, teamFilterLc]);

  function toggleLeague(lg) {
    setSelectedLeagues((prev) => {
      const next = new Set(prev);
      if (next.has(lg)) next.delete(lg);
      else next.add(lg);
      return next;
    });
  }

  // Parsing helpers reused across sort modes
  function parseToMs(val) {
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
  }

  function getCloseMs(p) {
    const raw = p?.packCloseTime ?? p?.pack_close_time ?? null;
    const ms = parseToMs(raw);
    return Number.isFinite(ms) ? ms : Number.POSITIVE_INFINITY;
  }

  function getOpenMs(p) {
    const raw = p?.packOpenTime ?? p?.pack_open_time ?? null;
    const ms = parseToMs(raw);
    return Number.isFinite(ms) ? ms : Number.NEGATIVE_INFINITY;
  }

  const sortedPacks = useMemo(() => {
    const arr = Array.isArray(visiblePacks) ? visiblePacks.slice() : [];
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
  }, [visiblePacks, sortBy]);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        {teamFilterLc && (
          <div className="text-sm text-gray-700">
            Showing team: <strong>{teamFilterLc.toUpperCase()}</strong>
          </div>
        )}
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

      {!hideLeagueChips && leagues.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {leagues.map((lg) => {
            const isSelected = selectedLeagues.has(lg);
            return (
              <button
                key={lg}
                type="button"
                onClick={() => toggleLeague(lg)}
                className={
                  (isSelected
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-gray-100 text-gray-800 border-gray-300') +
                  ' inline-flex items-center gap-1 border rounded-full px-3 py-1 text-xs md:text-sm'
                }
                aria-pressed={isSelected}
                aria-label={(isSelected ? 'Hide ' : 'Show ') + lg.toUpperCase()}
              >
                <span>{lg.toUpperCase()}</span>
                {isSelected && <span aria-hidden>×</span>}
              </button>
            );
          })}
        </div>
      )}

      {sortedPacks && sortedPacks.length > 0 ? (
        <div className="w-full flex flex-col gap-3 md:gap-4">
          {sortedPacks.map((pack, idx) => (
            <PackPreview key={pack.packID || pack.airtableId || pack.id} index={idx} pack={pack} accent={accent} />
          ))}
        </div>
      ) : (
        <p className="text-center">No packs to show</p>
      )}
    </div>
  );
}
