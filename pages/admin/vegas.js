import { useState } from 'react';

const providers = [
  { label: 'ESPN BET (58)', value: '58' },
  { label: 'Caesars (38)', value: '38' },
  { label: 'William Hill (31)', value: '31' },
  { label: 'SugarHouse (41)', value: '41' },
  { label: 'Unibet (36)', value: '36' },
  { label: 'Bet365 (2000)', value: '2000' },
  { label: 'Westgate (25)', value: '25' },
  { label: 'Accuscore (1001)', value: '1001' },
  { label: 'Consensus (1004)', value: '1004' },
  { label: 'Numberfire (1003)', value: '1003' },
  { label: 'TeamRankings (1002)', value: '1002' },
];

export default function Vegas() {
  const [eventId, setEventId] = useState('');
  const [leagueInput, setLeagueInput] = useState('baseball/mlb');
  const [providerId, setProviderId] = useState('58');
  const [response, setResponse] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResponse(null);
    const parts = leagueInput.split('/');
    if (parts.length !== 2) {
      setError('League must be in format sport/league (e.g. baseball/mlb)');
      setLoading(false);
      return;
    }
    const url = `/api/admin/vegas-odds?eventId=${encodeURIComponent(eventId)}&league=${encodeURIComponent(leagueInput)}&providerId=${providerId}`;
    try {
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(`Error ${res.status}: ${res.statusText}`);
      const data = await res.json();
      setResponse(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">Raw Odds Viewer</h1>
      <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Event ID</label>
          <input
            type="text"
            value={eventId}
            onChange={(e) => setEventId(e.target.value)}
            placeholder="e.g. 401696636"
            className="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring focus:border-blue-300"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">League (sport/league)</label>
          <input
            type="text"
            value={leagueInput}
            onChange={(e) => setLeagueInput(e.target.value)}
            placeholder="e.g. baseball/mlb"
            className="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring focus:border-blue-300"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Oddsmaker</label>
          <select
            value={providerId}
            onChange={(e) => setProviderId(e.target.value)}
            className="w-full border border-gray-300 rounded px-3 py-2 bg-white focus:outline-none focus:ring focus:border-blue-300"
          >
            {providers.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <button
            type="submit"
            disabled={!eventId || !leagueInput || loading}
            className="w-full px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
          >
            {loading ? 'Loading...' : 'Get Odds'}
          </button>
        </div>
      </form>
      {error && <pre className="mt-4 text-red-600">{error}</pre>}

      {response && <pre className="mt-4 whitespace-pre-wrap">{JSON.stringify(response, null, 2)}</pre>}
    </div>
  );
}
