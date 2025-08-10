import { useEffect, useMemo, useState } from 'react';

export default function OddsApiTestPage() {
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('—');
  const [endpoint, setEndpoint] = useState('—');
  const [remain, setRemain] = useState('—');
  const [used, setUsed] = useState('—');
  const [time, setTime] = useState('—');
  const [body, setBody] = useState('');
  const [error, setError] = useState(null);
  const [sports, setSports] = useState([]);
  const [selectedSport, setSelectedSport] = useState('baseball_mlb');
  const [regions, setRegions] = useState('us');
  const [markets, setMarkets] = useState('h2h');
  const [oddsFormat, setOddsFormat] = useState('american');
  const [dateFormat, setDateFormat] = useState('iso');
  const [bookmakers, setBookmakers] = useState('');

  async function call(path) {
    setLoading(true);
    setError(null);
    setBody('Loading…');
    setRemain('—');
    setUsed('—');
    setStatus('—');
    setEndpoint(path);
    setTime(new Date().toLocaleString());
    try {
      const url = new URL(path, window.location.origin);
      if (apiKey.trim()) url.searchParams.set('apiKey', apiKey.trim());
      const res = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
      setStatus(`${res.status} ${res.statusText || ''}`);
      setRemain(res.headers.get('x-requests-remaining') || '—');
      setUsed(res.headers.get('x-requests-used') || '—');
      setTime(new Date().toLocaleString());
      const text = await res.text();
      try {
        const json = JSON.parse(text);
        setBody(JSON.stringify(json, null, 2));
      } catch (_) {
        setBody(text || '(no body)');
      }
    } catch (err) {
      setError(err.message || String(err));
      setBody('');
    } finally {
      setLoading(false);
    }
  }

  // Fetch sports list on mount (or when apiKey changes, if overriding)
  useEffect(() => {
    let aborted = false;
    (async () => {
      try {
        const url = new URL('/api/admin/the-odds/sports', window.location.origin);
        if (apiKey.trim()) url.searchParams.set('apiKey', apiKey.trim());
        const res = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
        const data = await res.json();
        if (!aborted && Array.isArray(data)) {
          setSports(data);
        }
      } catch (e) {
        // ignore fetch errors here; user can still run manually
      }
    })();
    return () => { aborted = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sportOptions = useMemo(() => {
    return sports.map((s) => ({ value: s.key, label: s.title || s.key }));
  }, [sports]);

  return (
    <div className="p-4 max-w-4xl">
      <h1 className="text-2xl font-bold mb-2">Odds API Test</h1>
      <p className="text-sm text-gray-600 mb-4">
        Uses server-side proxies. Leave API key empty to use the server env var, or paste a key to override.
      </p>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <input
          type="password"
          placeholder="Optional: override apiKey"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          className="w-full sm:w-96 border border-gray-300 rounded px-3 py-2"
        />
        <button
          onClick={() => call('/api/admin/the-odds/sports')}
          disabled={loading}
          className="px-3 py-2 rounded bg-black text-white disabled:opacity-50"
        >
          {loading && endpoint.includes('/the-odds/sports') ? 'Checking…' : 'Check Key (GET /sports)'}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Left column: filters */}
        <div className="border rounded p-3 bg-white md:col-span-1">
          <h2 className="font-semibold mb-2">Filters</h2>
          <div className="space-y-3 text-sm">
            <div>
              <label className="block text-gray-700 mb-1">Sport</label>
              <select
                value={selectedSport}
                onChange={(e) => setSelectedSport(e.target.value)}
                className="w-full border rounded px-2 py-2 bg-white"
              >
                <option value="baseball_mlb">baseball_mlb</option>
                {sportOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-gray-700 mb-1">Regions</label>
              <select value={regions} onChange={(e) => setRegions(e.target.value)} className="w-full border rounded px-2 py-2 bg-white">
                <option value="us">us</option>
                <option value="us2">us2</option>
                <option value="eu">eu</option>
                <option value="uk">uk</option>
                <option value="au">au</option>
              </select>
            </div>
            <div>
              <label className="block text-gray-700 mb-1">Markets</label>
              <select value={markets} onChange={(e) => setMarkets(e.target.value)} className="w-full border rounded px-2 py-2 bg-white">
                <option value="h2h">h2h</option>
                <option value="spreads">spreads</option>
                <option value="totals">totals</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-gray-700 mb-1">Odds Format</label>
                <select value={oddsFormat} onChange={(e) => setOddsFormat(e.target.value)} className="w-full border rounded px-2 py-2 bg-white">
                  <option value="american">american</option>
                  <option value="decimal">decimal</option>
                </select>
              </div>
              <div>
                <label className="block text-gray-700 mb-1">Date Format</label>
                <select value={dateFormat} onChange={(e) => setDateFormat(e.target.value)} className="w-full border rounded px-2 py-2 bg-white">
                  <option value="iso">iso</option>
                  <option value="unix">unix</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-gray-700 mb-1">Bookmakers (optional, comma-separated)</label>
              <input
                type="text"
                placeholder="e.g. draftkings,betmgm"
                value={bookmakers}
                onChange={(e) => setBookmakers(e.target.value)}
                className="w-full border rounded px-2 py-2"
              />
            </div>
            <div className="pt-1">
              <button
                onClick={() => {
                  const params = new URLSearchParams({ regions, markets, oddsFormat, dateFormat });
                  if (bookmakers.trim()) params.set('bookmakers', bookmakers.trim());
                  const path = `/api/admin/the-odds/odds?sport=${encodeURIComponent(selectedSport)}&${params.toString()}`;
                  call(path);
                }}
                disabled={loading}
                className="w-full px-3 py-2 rounded bg-gray-200 hover:bg-gray-300 disabled:opacity-50"
              >
                {loading && endpoint.includes('/the-odds/odds') ? 'Loading…' : 'Fetch Odds'}
              </button>
            </div>
          </div>
        </div>

        {/* Right columns: meta + body */}
        <div className="border border-dashed rounded p-3 bg-gray-50 md:col-span-2">
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
            <dt className="text-gray-600">Status</dt><dd className="font-medium">{status}</dd>
            <dt className="text-gray-600">Endpoint</dt><dd className="break-all text-gray-800">{endpoint}</dd>
            <dt className="text-gray-600">x-requests-remaining</dt><dd>{remain}</dd>
            <dt className="text-gray-600">x-requests-used</dt><dd>{used}</dd>
            <dt className="text-gray-600">Time</dt><dd>{time}</dd>
          </dl>
          <div className="border border-dashed rounded p-3 bg-white mt-3 overflow-auto min-h-[200px]">
            <pre className="whitespace-pre-wrap text-xs leading-5">{body}</pre>
          </div>
        </div>
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </div>
  );
}


