import { useEffect, useMemo, useState } from 'react';
import PackPreview from './PackPreview';

export default function PackExplorer({ packs = [], accent = 'blue' }) {
  const [selectedLeagues, setSelectedLeagues] = useState(new Set());

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

  const visiblePacks = useMemo(() => {
    if (!selectedLeagues) return packs;
    if (leagues.length > 0 && selectedLeagues.size === 0) return [];
    return (packs || []).filter((p) => {
      const lg = (p?.packLeague || '').toString().toLowerCase();
      if (!lg) return true; // Packs without a league are always visible
      return selectedLeagues.has(lg);
    });
  }, [packs, selectedLeagues, leagues]);

  function toggleLeague(lg) {
    setSelectedLeagues((prev) => {
      const next = new Set(prev);
      if (next.has(lg)) next.delete(lg);
      else next.add(lg);
      return next;
    });
  }

  return (
    <div>
      {leagues.length > 0 && (
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

      {visiblePacks && visiblePacks.length > 0 ? (
        <div className="w-full flex flex-col gap-3 md:gap-4">
          {visiblePacks.map((pack, idx) => (
            <PackPreview key={pack.packID || pack.airtableId || pack.id} index={idx} pack={pack} accent={accent} />
          ))}
        </div>
      ) : (
        <p className="text-center">No packs to show</p>
      )}
    </div>
  );
}
