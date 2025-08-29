import { useSession } from 'next-auth/react';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

export default function NewFormulaPage() {
  const { data: session, status } = useSession();

  const [formulaKey, setFormulaKey] = useState('mlb_player_stat_ou');
  const [displayName, setDisplayName] = useState('MLB Player Stat O/U');
  const [formulaKeyTouched, setFormulaKeyTouched] = useState(false);
  const [league, setLeague] = useState('mlb');
  const [dataSource, setDataSource] = useState('major-mlb');
  const [active, setActive] = useState(true);

  const [category, setCategory] = useState('Pitching');
  // Single metric input removed; we use a single multi-select for one-or-many metrics
  const [timeframe, setTimeframe] = useState('game');
  const [metricsSelected, setMetricsSelected] = useState([]);
  const [aggregate, setAggregate] = useState('sum');
  

  const [teamAbv, setTeamAbv] = useState('');
  const [playerId, setPlayerId] = useState('');
  const [gameDate, setGameDate] = useState('');

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveSuccess, setSaveSuccess] = useState('');

  const [dryRunLoading, setDryRunLoading] = useState(false);
  const [dryRunResult, setDryRunResult] = useState(null);
  const [dryRunError, setDryRunError] = useState('');

  const requiredParams = useMemo(() => {
    return ['teamAbv', 'playerId', 'gameDate'];
  }, []);

  const defaultParams = useMemo(() => {
    const obj = { category, timeframe };
    if (Array.isArray(metricsSelected) && metricsSelected.length > 0) {
      obj.metrics = metricsSelected;
      obj.aggregate = aggregate;
    }
    return obj;
  }, [category, timeframe, metricsSelected, aggregate]);

  const metricOptions = useMemo(() => {
    const byCategory = {
      Hitting: [
        'AB','H','R','RBI','BB','IBB','HBP','SO','TB','2B','3B','HR','SAC','SF','GIDP'
      ],
      Pitching: [
        'SO','BB','ER','H','HR','R','Pitches','Strikes','Batters Faced','Flyouts','Groundouts','Balk'
      ],
      Fielding: [
        'E'
      ],
      BaseRunning: [
        'SB','CS','PO'
      ],
    };
    return byCategory[category] || [];
  }, [category]);

  // Ensure at least one metric is selected when category changes
  useEffect(() => {
    if ((!metricsSelected || metricsSelected.length === 0) && metricOptions.length > 0) {
      setMetricsSelected([metricOptions[0]]);
    }
  }, [metricOptions]);

  const defaultParamsJson = useMemo(() => {
    try {
      return JSON.stringify(defaultParams, null, 2);
    } catch {
      return '{}';
    }
  }, [defaultParams]);

  const testParams = useMemo(() => {
    const obj = { ...defaultParams, teamAbv, playerId, gameDate };
    return obj;
  }, [defaultParams, teamAbv, playerId, gameDate]);

  // Auto-generate formulaKey from displayName unless user manually edits the key
  useEffect(() => {
    if (formulaKeyTouched) return;
    const slug = String(displayName || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .replace(/_{2,}/g, '_');
    if (slug) setFormulaKey(slug);
  }, [displayName, formulaKeyTouched]);

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setSaveError('');
    setSaveSuccess('');
    try {
      const res = await fetch('/api/admin/formulas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          formulaKey,
          displayName,
          league,
          dataSource,
          // Send as raw JSON strings so Airtable Long Text can store directly
          requiredParams: JSON.stringify(requiredParams),
          defaultParams: JSON.stringify(defaultParams),
          active,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to create formula');
      setSaveSuccess('Formula saved.');
    } catch (err) {
      setSaveError(err.message || 'Failed to create formula');
    } finally {
      setSaving(false);
    }
  }

  async function handleDryRun() {
    setDryRunLoading(true);
    setDryRunError('');
    setDryRunResult(null);
    try {
      // For V1 we reuse the existing grader by posting a synthetic request.
      // It expects an Airtable prop id; for builder dry-run, we just pass a fake id and supply params via override.
      const res = await fetch('/api/admin/gradePropByFormula', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ airtableId: 'rec_fake_builder', dryRun: true, overrideFormulaParams: testParams }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Dry run failed');
      setDryRunResult(data);
    } catch (err) {
      setDryRunError(err.message || 'Dry run failed');
    } finally {
      setDryRunLoading(false);
    }
  }

  if (status === 'loading') return <div className="p-4">Loading…</div>;
  if (!session?.user) return <div className="p-4">Not authorized</div>;

  return (
    <div className="p-4 max-w-6xl mx-auto">
      <div className="mb-4">
        <Link href="/admin" className="text-blue-600 underline">&larr; Back to Admin</Link>
      </div>
      <h1 className="text-2xl font-bold mb-4">Formula Builder (V1)</h1>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className="border rounded-lg p-4">
          <h2 className="text-lg font-semibold mb-3">Basics</h2>
          <form onSubmit={handleSave} className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700">Display Name</label>
              <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="mt-1 block w-full border rounded px-2 py-1" placeholder="MLB Player Stat O/U" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Formula Key</label>
              <input
                value={formulaKey}
                onChange={(e) => { setFormulaKeyTouched(true); setFormulaKey(e.target.value); }}
                className="mt-1 block w-full border rounded px-2 py-1"
                placeholder="mlb_player_stat_ou"
              />
              <p className="text-xs text-gray-500 mt-1">Auto-generated from Display Name; you can override it.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700">League</label>
                <select value={league} onChange={(e) => setLeague(e.target.value)} className="mt-1 block w-full border rounded px-2 py-1">
                  <option value="mlb">mlb</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Data Source</label>
                <select value={dataSource} onChange={(e) => setDataSource(e.target.value)} className="mt-1 block w-full border rounded px-2 py-1">
                  <option value="major-mlb">major-mlb</option>
                </select>
              </div>
              <label className="inline-flex items-center mt-7">
                <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="mr-2" /> Active
              </label>
            </div>

            <h3 className="text-md font-semibold mt-4">Default Params</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700">Category</label>
                <select value={category} onChange={(e) => setCategory(e.target.value)} className="mt-1 block w-full border rounded px-2 py-1">
                  <option>Pitching</option>
                  <option>Hitting</option>
                  <option>Fielding</option>
                  <option>BaseRunning</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Timeframe</label>
                <select value={timeframe} onChange={(e) => setTimeframe(e.target.value)} className="mt-1 block w-full border rounded px-2 py-1">
                  <option value="game">game</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700">Metric(s)</label>
                <select
                  multiple
                  value={metricsSelected}
                  onChange={(e) => setMetricsSelected(Array.from(e.target.selectedOptions).map(o => o.value))}
                  className="mt-1 block w-full border rounded px-2 py-1 h-40"
                >
                  {metricOptions.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">Select one or multiple stats to evaluate.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Aggregate</label>
                <select value={aggregate} onChange={(e) => setAggregate(e.target.value)} className="mt-1 block w-full border rounded px-2 py-1">
                  <option value="sum">sum</option>
                </select>
              </div>
            </div>

            

            <div className="flex items-center gap-2">
              <button type="submit" disabled={saving} className={`px-3 py-2 rounded text-white ${saving ? 'bg-gray-400' : 'bg-green-600 hover:bg-green-700'}`}>
                {saving ? 'Saving…' : 'Save Formula'}
              </button>
              {saveError && <span className="text-sm text-red-600">{saveError}</span>}
              {saveSuccess && <span className="text-sm text-green-700">{saveSuccess}</span>}
            </div>
          </form>
        </section>

        <section className="border rounded-lg p-4">
          <h2 className="text-lg font-semibold mb-3">Preview & Dry Run</h2>
          <div className="mb-3">
            <div className="text-sm font-medium text-gray-700">requiredParams</div>
            <div className="mt-1 flex flex-wrap gap-2">
              {requiredParams.map((k) => (
                <span key={k} className="px-2 py-1 bg-gray-100 rounded text-xs font-mono text-gray-800">{k}</span>
              ))}
            </div>
          </div>
          <div className="mb-3">
            <div className="text-sm font-medium text-gray-700">defaultParams</div>
            <pre className="p-2 bg-gray-50 border rounded text-xs overflow-auto">{defaultParamsJson}</pre>
          </div>

          <div className="mt-4 border-t pt-4">
            <h3 className="text-md font-semibold mb-2">Dry Run (test inputs)</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700">Team Abv</label>
                <input value={teamAbv} onChange={(e) => setTeamAbv(e.target.value.toUpperCase())} className="mt-1 block w-full border rounded px-2 py-1" placeholder="PIT" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Player ID</label>
                <input value={playerId} onChange={(e) => setPlayerId(e.target.value)} className="mt-1 block w-full border rounded px-2 py-1" placeholder="694973" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Game Date (YYYYMMDD)</label>
                <input value={gameDate} onChange={(e) => setGameDate(e.target.value)} className="mt-1 block w-full border rounded px-2 py-1" placeholder="20240601" />
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <button type="button" onClick={handleDryRun} disabled={dryRunLoading || !playerId || !gameDate} className={`px-3 py-2 rounded text-white ${dryRunLoading ? 'bg-gray-400' : 'bg-indigo-600 hover:bg-indigo-700'}`}>
                {dryRunLoading ? 'Testing…' : 'Dry Run'}
              </button>
              {dryRunError && <span className="text-sm text-red-600">{dryRunError}</span>}
            </div>
            {dryRunResult && (
              <div className="mt-3">
                <div className="text-sm font-medium text-gray-700">Result</div>
                <pre className="p-2 bg-gray-50 border rounded text-xs overflow-auto">{JSON.stringify(dryRunResult, null, 2)}</pre>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}


