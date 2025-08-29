import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import PackPreview from './PackPreview';

export default function PackExplorer({ packs = [] }) {
  const [leagueFilter, setLeagueFilter] = useState('');
  const router = useRouter();

  // Apply initial league filter from query string if present
  useEffect(() => {
    const q = (router.query?.league || '').toString().toLowerCase();
    if (q) setLeagueFilter(q);
  }, [router.query?.league]);

  const leagues = useMemo(() => {
    const unique = new Set(
      (packs || [])
        .map((p) => (p?.packLeague || '').toString().toLowerCase())
        .filter(Boolean)
    );
    return Array.from(unique).sort();
  }, [packs]);

  const visiblePacks = useMemo(() => {
    if (!leagueFilter) return packs;
    const lf = leagueFilter.toLowerCase();
    return (packs || []).filter(
      (p) => (p?.packLeague || '').toString().toLowerCase() === lf
    );
  }, [packs, leagueFilter]);

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <label className="text-sm text-gray-700">League</label>
        <select
          value={leagueFilter}
          onChange={(e) => setLeagueFilter(e.target.value)}
          className="px-2 py-1 border rounded text-sm"
        {
          ...({})
        }>
          <option value="">All leagues</option>
          {leagues.map((lg) => (
            <option key={lg} value={lg}>
              {lg.toUpperCase()}
            </option>
          ))}
        </select>
      </div>

      {visiblePacks && visiblePacks.length > 0 ? (
        <div className="w-full flex flex-col gap-3 md:gap-4">
          {visiblePacks.map((pack) => (
            <PackPreview key={pack.packID || pack.airtableId || pack.id} pack={pack} />
          ))}
        </div>
      ) : (
        <p className="text-center">No packs to show</p>
      )}
    </div>
  );
}
