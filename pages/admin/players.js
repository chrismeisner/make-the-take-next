import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';

export default function AdminPlayersPage() {
  const { data: session, status } = useSession();
  const [league, setLeague] = useState('nfl');
  const [teamAbv, setTeamAbv] = useState('');
  const [loading, setLoading] = useState(false);
  const [teamOptions, setTeamOptions] = useState([]);
  const [rows, setRows] = useState([]);
  const [fetchingTeam, setFetchingTeam] = useState(false);
  const [fetchResult, setFetchResult] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (league) params.set('league', league);
      if (teamAbv) params.set('teamAbv', teamAbv);
      const res = await fetch(`/api/admin/players?${params.toString()}`);
      const j = await res.json();
      if (j?.success) setRows(Array.isArray(j.players) ? j.players : []);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { if (status === 'authenticated') load(); }, [status, league, teamAbv]);

  // Load team options and filter by selected league
  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const r = await fetch('/api/teams');
        const j = await r.json();
        if (!ignore && j?.success) {
          const all = Array.isArray(j.teams) ? j.teams : [];
          const leagueForTeams = String(league || '').toLowerCase() === 'major-mlb' ? 'mlb' : String(league || '').toLowerCase();
          const filtered = all.filter(t => String(t.teamType || t.teamLeague || '').toLowerCase() === leagueForTeams);
          const abvs = Array.from(new Set(filtered.map(t => String(t.teamAbbreviation || '').toUpperCase()).filter(Boolean))).sort((a,b)=>a.localeCompare(b));
          setTeamOptions(abvs);
          // If current selection not in list, reset to All
          if (teamAbv && !abvs.includes(teamAbv)) setTeamAbv('');
        }
      } catch {}
    })();
    return () => { ignore = true; };
  }, [league]);

  if (status === 'loading') return <div className="p-4">Loading…</div>;
  if (!session) return <div className="p-4">Not authorized</div>;

  return (
    <div className="p-4">
      <div className="flex items-end gap-3 mb-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">League</label>
          <select className="mt-1 px-3 py-2 border rounded" value={league} onChange={(e) => setLeague(e.target.value)}>
            <option value="nfl">NFL</option>
            <option value="major-mlb">MLB</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Team</label>
          <select className="mt-1 px-3 py-2 border rounded" value={teamAbv} onChange={(e) => setTeamAbv(e.target.value)}>
            <option value="">All Teams</option>
            {teamOptions.map((abv) => (
              <option key={abv} value={abv}>{abv}</option>
            ))}
          </select>
        </div>
        <button onClick={load} disabled={loading} className={`px-3 py-2 rounded text-white ${loading ? 'bg-gray-400' : 'bg-blue-600 hover:bg-blue-700'}`}>{loading ? 'Refreshing…' : 'Refresh'}</button>
        <button
          onClick={async () => {
            if (!teamAbv) return;
            setFetchingTeam(true);
            setFetchResult('');
            try {
              // Client-side diagnostic logging for the full fetch->upsert flow
              try { console.log('[Admin/Players] Fetch Team Players clicked', { league, teamAbv }); } catch {}
              if (league === 'nfl') {
                // 1) Fetch players for the team(s) from local NFL tester endpoint
                const testerUrl = `/api/admin/api-tester/nflPlayers?teamAbv=${encodeURIComponent(teamAbv)}`;
                try { console.log('[Admin/Players] GET', testerUrl); } catch {}
                const r = await fetch(testerUrl);
                const j = await r.json();
                try { console.log('[Admin/Players] nflPlayers response', { ok: r.ok, status: r.status, success: j?.success, teams: j?.teams, count: j?.count }); } catch {}
                if (!r.ok || !j?.success) throw new Error(j?.error || 'Failed to fetch team players');
                const map = j.playersById || {};
                try {
                  const sample = Object.keys(map).slice(0, 5);
                  console.log('[Admin/Players] playersById size', Object.keys(map).length, 'sample ids →', sample);
                } catch {}
                const items = Object.entries(map).map(([id, p]) => ({
                  league: 'nfl',
                  id,
                  longName: p.longName || p.fullName || id,
                  firstName: p.firstName || (p.longName ? String(p.longName).split(' ')[0] : null) || null,
                  lastName: p.lastName || (p.longName ? String(p.longName).split(' ').slice(1).join(' ') || null : null) || null,
                  pos: p.pos || p.position || (p.position && (p.position.abbreviation || p.position.name)) || null,
                  teamAbv: p.teamAbv || teamAbv,
                }));
                try { console.log('[Admin/Players] Prepared items for upsert', { itemsLength: items.length }); } catch {}
                // 2) Upsert into our players table
                try { console.log('[Admin/Players] POST /api/admin/players', { items: items.length }); } catch {}
                const up = await fetch('/api/admin/players', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ items }),
                });
                const uj = await up.json();
                try { console.log('[Admin/Players] Upsert response', { ok: up.ok, status: up.status, success: uj?.success, upserted: uj?.upserted }); } catch {}
                if (!up.ok || !uj?.success) throw new Error(uj?.error || 'Upsert failed');
                setFetchResult(`Upserted ${uj.upserted} players for ${teamAbv}`);
                try { console.log('[Admin/Players] Refreshing table after upsert'); } catch {}
                await load();
              } else if (league === 'major-mlb') {
                // MLB via RapidAPI major-mlb /players/id
                const testerUrl = `/api/admin/api-tester/mlbPlayers?teamAbv=${encodeURIComponent(teamAbv)}`;
                try { console.log('[Admin/Players] GET', testerUrl); } catch {}
                const r = await fetch(testerUrl);
                const j = await r.json();
                try { console.log('[Admin/Players] mlbPlayers response', { ok: r.ok, status: r.status, success: j?.success, teams: j?.teams, count: j?.count }); } catch {}
                if (!r.ok || !j?.success) throw new Error(j?.error || 'Failed to fetch team players');
                const map = j.playersById || {};
                const items = Object.entries(map).map(([id, p]) => ({
                  league: 'major-mlb',
                  id,
                  longName: p.longName || p.fullName || id,
                  firstName: p.firstName || null,
                  lastName: p.lastName || null,
                  pos: p.pos || null,
                  teamAbv: p.teamAbv || teamAbv,
                }));
                try { console.log('[Admin/Players] Prepared items for upsert (MLB)', { itemsLength: items.length }); } catch {}
                const up = await fetch('/api/admin/players', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ items }),
                });
                const uj = await up.json();
                try { console.log('[Admin/Players] Upsert response (MLB)', { ok: up.ok, status: up.status, success: uj?.success, upserted: uj?.upserted }); } catch {}
                if (!up.ok || !uj?.success) throw new Error(uj?.error || 'Upsert failed');
                setFetchResult(`Upserted ${uj.upserted} players for ${teamAbv}`);
                await load();
              }
            } catch (e) {
              setFetchResult(`Error: ${e.message || 'Unknown error'}`);
              try { console.error('[Admin/Players] Fetch Team Players error', e); } catch {}
            } finally {
              try { console.log('[Admin/Players] Fetch Team Players finished'); } catch {}
              setFetchingTeam(false);
            }
          }}
          disabled={fetchingTeam || !teamAbv}
          className={`px-3 py-2 rounded text-white ${(!teamAbv || fetchingTeam) ? 'bg-gray-400' : 'bg-emerald-600 hover:bg-emerald-700'}`}
          title={teamAbv ? '' : 'Select a team'}
        >
          {fetchingTeam ? 'Fetching…' : 'Fetch Team Players'}
        </button>
        <Link href="/admin"><button className="px-3 py-2 bg-gray-600 text-white rounded hover:bg-gray-700">Back</button></Link>
      </div>
      {fetchResult && <div className="mb-3 text-sm">{fetchResult}</div>}

      <div className="overflow-auto border rounded">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-3 py-2">Headshot</th>
              <th className="text-left px-3 py-2">ID</th>
              <th className="text-left px-3 py-2">First</th>
              <th className="text-left px-3 py-2">Last</th>
              <th className="text-left px-3 py-2">Pos</th>
              <th className="text-left px-3 py-2">Team</th>
              <th className="text-left px-3 py-2">League</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={`${p.league}:${p.id}`} className="border-t">
                <td className="px-3 py-2">
                  {p.headshotUrl ? <img src={p.headshotUrl} alt={p.longName} className="h-10 w-10 rounded object-cover" /> : <span className="text-gray-400">—</span>}
                </td>
                <td className="px-3 py-2">{p.id}</td>
                <td className="px-3 py-2">{p.firstName || '—'}</td>
                <td className="px-3 py-2">{p.lastName || '—'}</td>
                <td className="px-3 py-2">{p.pos || '—'}</td>
                <td className="px-3 py-2">{p.teamAbv || '—'}</td>
                <td className="px-3 py-2">{p.league}</td>
              </tr>
            ))}
            {!rows.length && (
              <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-500">No players found.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}


