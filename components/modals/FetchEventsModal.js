import React, { useState } from 'react';

export default function FetchEventsModal({ isOpen, onClose, onFetched }) {
  const [league, setLeague] = useState('nfl');
  const [year, setYear] = useState(new Date().getFullYear());
  const [week, setWeek] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [generateCovers, setGenerateCovers] = useState(true);

  if (!isOpen) return null;

  async function handleFetch() {
    setLoading(true);
    setError('');
    setResult(null);
    try {
      if (league !== 'nfl') {
        throw new Error('Only NFL supported for now');
      }
      const res = await fetch('/api/admin/fetchNflEvents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year: Number(year), week: Number(week), generateCovers: !!generateCovers }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Fetch failed');
      }
      setResult({ processedCount: data.processedCount });
      onFetched?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
      <div className="bg-white rounded shadow-lg p-4 w-full max-w-md">
        <h2 className="text-xl font-semibold mb-3">Fetch Events</h2>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700">League</label>
            <select
              value={league}
              onChange={(e) => setLeague(e.target.value)}
              className="mt-1 px-3 py-2 border rounded w-full"
            >
              <option value="nfl">NFL</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Year</label>
            <input
              type="number"
              value={year}
              onChange={(e) => setYear(e.target.value)}
              className="mt-1 px-3 py-2 border rounded w-full"
              min="2000"
              max="3000"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Week</label>
            <input
              type="number"
              value={week}
              onChange={(e) => setWeek(e.target.value)}
              className="mt-1 px-3 py-2 border rounded w-full"
              min="1"
              max="25"
            />
          </div>
          <label className="inline-flex items-center text-sm text-gray-700">
            <input
              type="checkbox"
              className="mr-2"
              checked={generateCovers}
              onChange={(e) => setGenerateCovers(e.target.checked)}
            />
            Generate event covers
          </label>
          {error ? <div className="text-sm text-red-700">{error}</div> : null}
          {result ? (
            <div className="text-sm text-green-700">Processed {result.processedCount} events</div>
          ) : null}
        </div>
        <div className="mt-4 flex justify-end space-x-2">
          <button onClick={onClose} className="px-3 py-2 border rounded">Close</button>
          <button
            onClick={handleFetch}
            disabled={loading}
            className={`px-3 py-2 rounded text-white ${loading ? 'bg-gray-400' : 'bg-indigo-600 hover:bg-indigo-700'}`}
          >
            {loading ? 'Fetching…' : 'Fetch'}
          </button>
        </div>
      </div>
    </div>
  );
}


