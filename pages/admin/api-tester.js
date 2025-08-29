import { useState, useMemo, useEffect } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";

export default function ApiTesterPage() {
  const { data: session } = useSession();
  const [source, setSource] = useState('major-mlb');
  const [checking, setChecking] = useState(false);
  const [status, setStatus] = useState(null);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0,10));
  const [dateMode, setDateMode] = useState('today');
  const [selectedStat, setSelectedStat] = useState("");
  const [selectedGameId, setSelectedGameId] = useState("");
  const [showPlayers, setShowPlayers] = useState(false);
  const [selectedPlayerId, setSelectedPlayerId] = useState("");
  const [selectedTeamAbv, setSelectedTeamAbv] = useState("");
  const [eventTeamAbvs, setEventTeamAbvs] = useState([]);
  const [playersById, setPlayersById] = useState({});
  const [playersLoading, setPlayersLoading] = useState(false);
  const [playersError, setPlayersError] = useState("");
  const [availableStats, setAvailableStats] = useState([]);
  const [tpLoading, setTpLoading] = useState(false);
  const [rawBoxscore, setRawBoxscore] = useState(null);
  const [statType, setStatType] = useState('battingLine');
  const [timeZone, setTimeZone] = useState('America/New_York');

  // Helpers for timezone-safe date formatting
  function formatYMDInTZ(tz, instant) {
    try {
      const f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
      return f.format(instant);
    } catch {
      return new Date(instant).toISOString().slice(0, 10);
    }
  }
  function prevDayYMD(ymd) {
    const [y, m, d] = String(ymd).split('-').map((s) => parseInt(s, 10));
    if (!y || !m || !d) return ymd;
    const isLeap = (yr) => (yr % 4 === 0 && yr % 100 !== 0) || (yr % 400 === 0);
    const daysInMonth = (yr, mo) => [31, (isLeap(yr) ? 29 : 28), 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mo - 1];
    let yy = y, mm = m, dd = d - 1;
    if (dd < 1) {
      mm = m - 1;
      if (mm < 1) { yy = y - 1; mm = 12; }
      dd = daysInMonth(yy, mm);
    }
    const mmStr = String(mm).padStart(2, '0');
    const ddStr = String(dd).padStart(2, '0');
    return `${yy}-${mmStr}-${ddStr}`;
  }

  // Only allow MLB "game line" metrics in the Stat dropdown
  const MLB_ALLOWED_KEY_SYNONYMS = useMemo(() => {
    return new Map([
      ['ab', ['ab', 'atbats', 'at-bats']],
      ['r', ['r', 'runs']],
      ['h', ['h', 'hits']],
      ['rbi', ['rbi', 'rbis']],
      ['hr', ['hr', 'homeruns', 'home runs', 'home_runs']],
      ['bb', ['bb', 'walks', 'baseonballs', 'base on balls', 'base_on_balls']],
      ['k', ['k', 'so', 'strikeouts', 'strike outs', 'strike_outs']],
      ['pitches', ['#p', 'p', 'pitches']],
      ['avg', ['avg', 'battingaverage', 'batting average', 'batting_average']],
      ['obp', ['obp', 'onbasepercentage', 'on base percentage', 'on_base_percentage']],
      ['slg', ['slg', 'sluggingpercentage', 'slugging percentage', 'slugging_percentage']],
    ]);
  }, []);

  const MLB_ORDER = useMemo(() => ['ab','r','h','rbi','hr','bb','k','pitches','avg','obp','slg'], []);

  function isAllowedStatKey(key) {
    const lc = String(key || '').toLowerCase();
    if (!lc) return false;
    for (const syns of MLB_ALLOWED_KEY_SYNONYMS.values()) {
      if (syns.some((s) => lc === s)) return true;
    }
    return false;
  }

  function orderIndexForKey(key) {
    const lc = String(key || '').toLowerCase();
    let idx = MLB_ORDER.length + 100;
    let i = 0;
    for (const canonical of MLB_ORDER) {
      const syns = MLB_ALLOWED_KEY_SYNONYMS.get(canonical) || [];
      if (syns.some((s) => s === lc)) return i;
      i += 1;
    }
    return idx;
  }

  // Helpers to detect whether a player appeared in the selected game
  function expectedGameTokenForSelected() {
    try {
      const game = gamesForDate.find((g) => (g.id || g.gameID) === selectedGameId) || {};
      const away = (game.awayAbv || game.awayTeamAbv || game.away || game.awayTeam || '').toString().toUpperCase();
      const home = (game.homeAbv || game.homeTeamAbv || game.home || game.homeTeam || '').toString().toUpperCase();
      const ymd = String(status?.meta?.date || (effectiveScoreboardDate ? effectiveScoreboardDate.replace(/-/g, '') : ''));
      if (!away || !home || !ymd) return '';
      return `${ymd}_${away}@${home}`;
    } catch {
      return '';
    }
  }

  function didAppearForSelectedGame(player) {
    const stats = player?.stats || {};
    const keys = Object.keys(stats);
    const indicators = [
      'inningspitched','batters faced','ab','pa','h','rbi','tb','bb','so','sb','cs','ip','bf','pitches','save','hold','win','loss'
    ];
    const hasGameStat = keys.some((k) => {
      const kl = String(k).toLowerCase();
      return indicators.some((ind) => kl.includes(ind));
    });
    if (hasGameStat) return true;
    const last = String(player?.lastGamePlayed || '').toUpperCase();
    const token = expectedGameTokenForSelected().toUpperCase();
    return !!(last && token && last === token);
  }

  const gamesForDate = useMemo(() => {
    const list = Array.isArray(status?.games) ? status.games : [];
    return list;
  }, [status]);

  const availablePlayers = useMemo(() => {
    const ids = Object.keys(playersById || {});
    const list = ids.map((id) => ({
      id,
      team: playersById[id]?.teamAbv || '',
      appeared: didAppearForSelectedGame(playersById[id]),
    }));
    // Prefer players who appear to have participated in the selected game
    list.sort((a, b) => {
      if (a.appeared && !b.appeared) return -1;
      if (!a.appeared && b.appeared) return 1;
      return a.id.localeCompare(b.id);
    });
    return list;
  }, [playersById]);

  const TEAM_AGG_ID = "__TEAM__";

  const statOptions = useMemo(() => {
    const boxKeys = Array.isArray(availableStats) ? availableStats : [];
    if (boxKeys.length) {
      try {
        console.log('[api-tester] statOptions from box score', { count: boxKeys.length, sample: boxKeys.slice(0, 10) });
      } catch {}
      return boxKeys;
    }
    const ids = Object.keys(playersById || {});
    // Respect current filters when deriving stats from roster fallback
    let poolIds = ids;
    if (selectedPlayerId && selectedPlayerId !== TEAM_AGG_ID) {
      poolIds = ids.filter((id) => id === selectedPlayerId);
    } else if (selectedTeamAbv) {
      const teamKey = selectedTeamAbv.toUpperCase();
      poolIds = ids.filter((id) => (playersById[id]?.teamAbv || '').toUpperCase() === teamKey);
    }
    const keySet = new Set();
    for (const id of poolIds) {
      const stats = playersById[id]?.stats || {};
      for (const [k, v] of Object.entries(stats)) {
        const num = typeof v === 'string' ? Number(v) : v;
        if (Number.isFinite(num)) keySet.add(k);
      }
    }
    const derived = Array.from(keySet).sort();
    try {
      console.log('[api-tester] statOptions derived', {
        teamFilter: selectedTeamAbv || null,
        playerFilter: selectedPlayerId || null,
        poolSize: poolIds.length,
        count: derived.length,
        sample: derived.slice(0, 10),
      });
    } catch {}
    return derived;
  }, [availableStats, playersById, selectedGameId, selectedTeamAbv, selectedPlayerId]);

  const computedStatOptions = useMemo(() => {
    const box = Array.isArray(availableStats) ? availableStats : [];
    if (box.length) {
      let out;
      if (statType === 'battingLine') {
        out = Array.from(new Set(box.filter(isAllowedStatKey)));
        out.sort((a, b) => orderIndexForKey(a) - orderIndexForKey(b));
      } else {
        out = Array.from(new Set(box));
        out.sort((a, b) => String(a).localeCompare(String(b)));
      }
      try { console.log('[api-tester] computedStatOptions using box score', { type: statType, count: out.length, sample: out.slice(0, 10) }); } catch {}
      return out;
    }
    const derived = Array.isArray(statOptions) ? statOptions : [];
    if (derived.length) {
      let out;
      if (statType === 'battingLine') {
        out = Array.from(new Set(derived.filter(isAllowedStatKey)));
        out.sort((a, b) => orderIndexForKey(a) - orderIndexForKey(b));
      } else {
        out = Array.from(new Set(derived));
        out.sort((a, b) => String(a).localeCompare(String(b)));
      }
      try { console.log('[api-tester] computedStatOptions using derived', { type: statType, count: out.length, sample: out.slice(0, 10) }); } catch {}
      return out;
    }
    return [];
  }, [availableStats, statOptions, statType]);

  // Reset selected stat when changing the stat type to avoid mismatches
  useEffect(() => {
    setSelectedStat("");
  }, [statType]);

  function resolveSelectedStatKey() {
    if (!selectedStat) return null;
    // If it is a direct numeric stat key, use it as-is
    if (!selectedStat.includes(':')) return selectedStat;
    // Attempt to map category:metric to a likely numeric key among players
    const parts = String(selectedStat).split(':');
    const metric = (parts[1] || '').trim();
    if (!metric) return null;
    const metricLc = metric.toLowerCase();
    const matchCounts = new Map();
    const register = (key) => {
      const c = matchCounts.get(key) || 0;
      matchCounts.set(key, c + 1);
    };
    Object.values(playersById || {}).forEach((p) => {
      const stats = p?.stats || {};
      Object.keys(stats).forEach((k) => {
        const kl = String(k).toLowerCase();
        if (kl === metricLc || kl.endsWith('.' + metricLc) || kl.endsWith('_' + metricLc)) {
          register(k);
        }
      });
    });
    if (!matchCounts.size) return null;
    let bestKey = null;
    let bestCount = -1;
    for (const [k, c] of matchCounts.entries()) {
      if (c > bestCount) { bestCount = c; bestKey = k; }
    }
    return bestKey;
  }

  function getSelectedPlayerStatValue() {
    const resolvedKey = resolveSelectedStatKey();
    if (!resolvedKey) return 0;
    // If a specific player is selected, return that player's value
    if (selectedPlayerId && selectedPlayerId !== TEAM_AGG_ID) {
      const val = Number(playersById?.[selectedPlayerId]?.stats?.[resolvedKey]);
      return Number.isFinite(val) ? val : 0;
    }
    // Otherwise compute aggregate by team if selected, else across all players
    const teamKeyUpper = selectedTeamAbv ? String(selectedTeamAbv).toUpperCase() : null;
    let sum = 0;
    Object.values(playersById || {}).forEach((p) => {
      const matchesTeam = !teamKeyUpper || (String(p?.teamAbv || '').toUpperCase() === teamKeyUpper);
      if (matchesTeam) {
        const val = Number(p?.stats?.[resolvedKey]);
        if (Number.isFinite(val)) sum += val;
      }
    });
    return sum;
  }

  async function checkConnection() {
    setChecking(true);
    setStatus(null);
    setPlayersById({});
    setShowPlayers(false);
    setSelectedPlayerId("");
    setSelectedTeamAbv("");
    setSelectedGameId("");
    setSelectedStat("");
    setEventTeamAbvs([]);
    setPlayersError("");
    try {
      const params = new URLSearchParams();
      if (date) {
        // convert YYYY-MM-DD -> YYYYMMDD
        params.set('gameDate', String(date).replace(/-/g, ''));
      }
      // Source fixed to Major MLB; do not pass param
      const res = await fetch(`/api/admin/api-tester/status?${params.toString()}`);
      const data = await res.json();
      setStatus(data);
    } catch (e) {
      setStatus({ success: false, error: e.message });
    } finally {
      setChecking(false);
    }
  }

  // Removed top performers fetch (legacy from tank01)

  // Removed top performers effect (legacy)

  // Keep date in sync with the dropdown selection unless "Other" is chosen
  useEffect(() => {
    if (dateMode === 'today') {
      setDate(formatYMDInTZ(timeZone, new Date()));
    } else if (dateMode === 'yesterday') {
      const todayYMD = formatYMDInTZ(timeZone, new Date());
      setDate(prevDayYMD(todayYMD));
    }
  }, [dateMode, timeZone]);

  // Auto-fetch players when an event is selected so stat readouts have data
  useEffect(() => {
    if (!selectedGameId) return;
    if (playersLoading) return;
    const hasPlayers = Object.keys(playersById || {}).length > 0;
    if (hasPlayers) return;
    fetchPlayersForSelectedEvent();
  }, [selectedGameId]);

  // If a topPerformers category:metric is selected and we can resolve a direct
  // numeric stat key from player stats, switch the selection to that key so
  // value calculations are reliable.
  useEffect(() => {
    if (!selectedStat || selectedStat.indexOf(':') === -1) return;
    const resolvedKey = resolveSelectedStatKey();
    if (resolvedKey && resolvedKey !== selectedStat) {
      setSelectedStat(resolvedKey);
    }
  }, [selectedStat, playersById, availableStats]);

  async function fetchPlayersForSelectedEvent() {
    setPlayersLoading(true);
    setPlayersError("");
    setPlayersById({});
    setRawBoxscore(null);
    try {
      const game = gamesForDate.find((g) => (g.id || g.gameID) === selectedGameId) || {};
      const id = game.id || game.gameID;
      if (!id) throw new Error('Missing gameID for selected event');

      const resp = await fetch(`/api/admin/api-tester/boxscore?gameID=${encodeURIComponent(id)}`);
      const json = await resp.json();
      if (!resp.ok || !json.success) {
        throw new Error(json.error || `Failed to fetch box score (${resp.status})`);
      }

      const boxPlayers = json?.normalized?.playersById || {};
      const statKeys = json?.normalized?.statKeys || [];
      try {
        console.log('[api-tester] boxscore response', {
          gameID: id,
          playersCount: Object.keys(boxPlayers).length,
          statKeysCount: Array.isArray(statKeys) ? statKeys.length : 0,
          statKeysSample: Array.isArray(statKeys) ? statKeys.slice(0, 10) : [],
        });
      } catch {}
      setRawBoxscore(json?.data || null);

      // Derive team abbreviations from player map; fallback to game fields
      const teamsFromBox = Array.from(new Set(Object.values(boxPlayers).map((p) => String(p.teamAbv || '').toUpperCase()).filter(Boolean)));
      let teamAbvs = teamsFromBox;
      if (!teamAbvs.length) {
        const candidates = [
          game.awayAbv, game.homeAbv,
          game.awayTeamAbv, game.homeTeamAbv,
          game.away, game.home,
          game.awayTeam, game.homeTeam,
        ].filter(Boolean).map(String);
        const seen = new Set();
        teamAbvs = candidates.filter((c) => {
          const key = c.toUpperCase();
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        }).slice(0, 2);
      }

      // Merge roster data when box score is empty OR appears to be missing pitchers
      let finalPlayersById = { ...boxPlayers };
      const hasAnyPitchers = Object.values(finalPlayersById).some((p) => {
        const pos = String(p?.pos || '').toUpperCase();
        return !!pos && (pos === 'P' || pos === 'SP' || pos === 'RP' || pos.includes('P'));
      });
      const shouldFetchRoster = (!Object.keys(finalPlayersById).length || (!hasAnyPitchers && teamAbvs.length));
      if (shouldFetchRoster && teamAbvs.length) {
        try {
          const currYear = new Date().getFullYear();
          const rosterResp = await fetch(`/api/admin/api-tester/players?teamAbv=${encodeURIComponent(teamAbvs.join(','))}&season=${currYear}`);
          const rosterJson = await rosterResp.json();
          if (rosterResp.ok && rosterJson.success && rosterJson.playersById) {
            const rosterMap = rosterJson.playersById || {};
            for (const [rid, rp] of Object.entries(rosterMap)) {
              const existing = finalPlayersById[rid] || {};
              finalPlayersById[rid] = {
                id: rid,
                longName: existing.longName || rp.longName || rid,
                firstName: existing.firstName || rp.firstName || '',
                lastName: existing.lastName || rp.lastName || '',
                pos: existing.pos || rp.pos || '',
                teamAbv: existing.teamAbv || rp.teamAbv || '',
                stats: { ...(existing.stats || {}), ...(rp.stats || {}) },
                ...(existing.gameLine ? { gameLine: existing.gameLine } : {}),
                ...(rp.lastGamePlayed ? { lastGamePlayed: rp.lastGamePlayed } : {}),
              };
            }
            try {
              console.log('[api-tester] roster merged', {
                teams: teamAbvs,
                before: Object.keys(boxPlayers).length,
                after: Object.keys(finalPlayersById).length,
              });
            } catch {}
          }
        } catch (e) {
          // Ignore roster fetch errors; continue with whatever we have
        }
      }

      setPlayersById(finalPlayersById);
      setAvailableStats(Array.isArray(statKeys) ? statKeys : []);
      // game line UI removed

      setEventTeamAbvs(teamAbvs);
      const firstTeam = teamAbvs[0] || "";
      setSelectedTeamAbv(firstTeam);
      setSelectedPlayerId(firstTeam ? TEAM_AGG_ID : "");
      setShowPlayers(true);
    } catch (e) {
      setPlayersError(e.message || 'Failed to fetch players');
      // Still show the selector with IDs as fallback
      setShowPlayers(true);
    } finally {
      setPlayersLoading(false);
    }
  }

  const availableTeamOptions = useMemo(() => {
    // Prefer teams inferred during fetch; otherwise derive from available players
    const fallback = Array.from(new Set(
      (availablePlayers || []).map((p) => (playersById[p.id]?.teamAbv || p.team)).filter(Boolean)
    ));
    const base = (eventTeamAbvs && eventTeamAbvs.length) ? eventTeamAbvs : fallback;
    return base.map((abv) => ({ abv: String(abv), label: String(abv) }));
  }, [availablePlayers, playersById, eventTeamAbvs]);

  const filteredData = useMemo(() => {
    try {
      const resolvedKey = resolveSelectedStatKey();
      const game = gamesForDate.find((g) => (g.id || g.gameID) === selectedGameId) || null;
      const selectedGame = game ? (() => {
        const gameTime = game.gameTime || '';
        let gameDate = null;
        try {
          if (gameTime) {
            gameDate = formatYMDInTZ(timeZone, new Date(gameTime));
          }
        } catch {}
        return {
          id: game.id || game.gameID,
          away: game.away || game.awayTeam || '',
          home: game.home || game.homeTeam || '',
          gameTime: gameTime || null,
          gameDate: gameDate,
        };
      })() : null;

      const teamFilter = selectedTeamAbv ? String(selectedTeamAbv).toUpperCase() : '';
      let entries = Object.entries(playersById || {});
      if (teamFilter) {
        entries = entries.filter(([, p]) => String(p?.teamAbv || '').toUpperCase() === teamFilter);
      }
      if (selectedPlayerId && selectedPlayerId !== TEAM_AGG_ID) {
        entries = entries.filter(([id]) => id === selectedPlayerId);
      }

      const players = entries.map(([id, p]) => ({
        id,
        longName: p?.longName || id,
        teamAbv: p?.teamAbv || '',
        pos: p?.pos || '',
        value: resolvedKey ? Number(p?.stats?.[resolvedKey]) : null,
      }));

      const aggregates = {
        byTeam: {},
        all: 0,
      };
      if (resolvedKey) {
        const teamSums = new Map();
        for (const [, p] of Object.entries(playersById || {})) {
          if (teamFilter && String(p?.teamAbv || '').toUpperCase() !== teamFilter) continue;
          const v = Number(p?.stats?.[resolvedKey]);
          if (!Number.isFinite(v)) continue;
          const t = String(p?.teamAbv || '').toUpperCase() || 'UNK';
          teamSums.set(t, (teamSums.get(t) || 0) + v);
          aggregates.all += v;
        }
        for (const [t, sum] of teamSums.entries()) {
          aggregates.byTeam[t] = sum;
        }
      }

      return {
        filters: {
          gameId: selectedGameId || null,
          teamAbv: selectedTeamAbv || null,
          playerId: selectedPlayerId || null,
          stat: selectedStat || null,
          statKey: resolvedKey || null,
          statType,
          scoreboardDate: date || null,
          timeZone,
        },
        selectedGame,
        aggregates,
        players,
      };
    } catch (e) {
      return { error: e.message };
    }
  }, [gamesForDate, playersById, selectedGameId, selectedTeamAbv, selectedPlayerId, selectedStat, statType, date, timeZone]);

  // Derive effective scoreboard date from status.meta.date if present
  const effectiveScoreboardDate = useMemo(() => {
    const raw = status?.meta?.date ? String(status.meta.date) : null; // YYYYMMDD
    if (raw && raw.length === 8) {
      const yyyy = raw.slice(0, 4);
      const mm = raw.slice(4, 6);
      const dd = raw.slice(6, 8);
      return `${yyyy}-${mm}-${dd}`;
    }
    return date;
  }, [status, date]);

  if (!session?.user) {
    return <div>Please log in.</div>;
  }

  const localTZ = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local';

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">API Tester</h1>
        <Link href="/admin" className="text-sm text-blue-600 hover:underline">Back to Admin</Link>
      </div>

      <section className="border rounded-lg p-4">
        <h2 className="text-lg font-semibold mb-2">Connection Status</h2>
        <p className="text-sm text-gray-600 mb-3">Check connectivity to the new external API source.</p>
        <div className="flex flex-wrap items-end gap-3 mb-3">
          <div>
            <label className="block text-sm font-medium text-gray-700">Date</label>
            <div className="mt-1 flex items-center gap-3">
              <select
                value={dateMode}
                onChange={(e) => setDateMode(e.target.value)}
                className="px-3 py-2 border rounded"
              >
                <option value="today">Today</option>
                <option value="yesterday">Yesterday</option>
                <option value="other">Other…</option>
              </select>
              {dateMode === 'other' && (
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="px-3 py-2 border rounded"
                />
              )}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Time zone</label>
            <select
              value={timeZone}
              onChange={(e) => setTimeZone(e.target.value)}
              className="px-3 py-2 border rounded"
            >
              <option value={localTZ}>Local ({localTZ})</option>
              <option value="America/New_York">US/Eastern</option>
              <option value="UTC">UTC</option>
            </select>
          </div>
          {/* Data source fixed to Major MLB now */}
        </div>
        <button
          onClick={checkConnection}
          disabled={checking}
          className="px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {checking ? "Checking..." : "Check Connection"}
        </button>

        {status && (
          <div className="mt-3 text-sm">
            {status.success ? (
              <p className="text-green-700">Connected ✓{status.message ? ` — ${status.message}` : ""}</p>
            ) : (
              <p className="text-red-700">Connection failed: {status.error || "Unknown error"}</p>
            )}
            {status.meta && (
              <pre className="mt-2 p-2 bg-gray-50 border rounded overflow-auto text-xs">
{JSON.stringify(status.meta, null, 2)}
              </pre>
            )}
            {Array.isArray(status.games) && (
              <details className="mt-2">
                <summary className="cursor-pointer text-gray-700">Games data</summary>
                <pre className="mt-2 p-2 bg-gray-50 border rounded overflow-auto text-xs">
{JSON.stringify(status.games, null, 2)}
                </pre>
              </details>
            )}

            {/* Player Stat selector populated from topPerformers keys */}
            {/* Events selector for the day's games */}
            {gamesForDate.length > 0 && (
              <div className="mt-4 pt-4 border-t">
                <div className="flex flex-wrap items-end gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Event</label>
                    <select
                      value={selectedGameId}
                      onChange={(e) => { setSelectedGameId(e.target.value); setShowPlayers(false); setSelectedPlayerId(""); }}
                      className="px-3 py-2 border rounded w-72"
                    >
                      <option value="">Select an event…</option>
                      {gamesForDate.map((g) => {
                        const id = g.id || g.gameID;
                        const label = `${g.away || g.awayTeam || ''}@${g.home || g.homeTeam || ''}`;
                        return <option key={id} value={id}>{label}</option>;
                      })}
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={fetchPlayersForSelectedEvent}
                    disabled={!selectedGameId}
                    className="px-3 py-2 bg-gray-700 text-white rounded hover:bg-gray-800 disabled:opacity-50"
                  >
                    Get Stats
                  </button>
                </div>
                {/* Source is fixed; no extra notes */}
              </div>
            )}

            {/* Players + Stat selectors */}
            {showPlayers && (
              <div className="mt-4">
                {/* Top Performers filter removed */}
                <div className="flex flex-wrap items-end gap-3">
                  {playersLoading && (
                    <div className="text-xs text-gray-600">Loading players…</div>
                  )}
                  {!!playersError && (
                    <div className="text-xs text-red-600">{playersError}</div>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Team</label>
                    <select
                      value={selectedTeamAbv}
                      onChange={(e) => { const v = e.target.value; setSelectedTeamAbv(v); setSelectedPlayerId(v ? TEAM_AGG_ID : ""); }}
                      className="px-3 py-2 border rounded w-48"
                    >
                      <option value="">All teams…</option>
                      {availableTeamOptions.map((t) => (
                        <option key={t.abv} value={t.abv}>{t.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Player</label>
                    <select
                      value={selectedPlayerId}
                      onChange={(e) => setSelectedPlayerId(e.target.value)}
                      className="px-3 py-2 border rounded w-72"
                    >
                      <option value="">Select a player…</option>
                      {selectedTeamAbv && (
                        <option value={TEAM_AGG_ID}>Whole team</option>
                      )}
                      {availablePlayers
                        .filter((p) => {
                          const team = (playersById[p.id]?.teamAbv || p.team || '').toUpperCase();
                          return !selectedTeamAbv || team === selectedTeamAbv.toUpperCase();
                        })
                        .map((p) => {
                          const display = playersById[p.id]?.longName || p.id;
                          const team = playersById[p.id]?.teamAbv || p.team;
                          return (
                            <option key={`${p.id}-${p.team}`} value={p.id}>{display}{team ? ` (${team})` : ''}</option>
                          );
                        })}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Stat Type</label>
                    <select
                      value={statType}
                      onChange={(e) => setStatType(e.target.value)}
                      className="px-3 py-2 border rounded w-48"
                    >
                      <option value="battingLine">Batting line</option>
                      <option value="all">All stats</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Stat</label>
                    <select
                      value={selectedStat}
                      onChange={(e) => setSelectedStat(e.target.value)}
                      className="px-3 py-2 border rounded w-72"
                      disabled={!computedStatOptions.length}
                    >
                      <option value="">{computedStatOptions.length ? 'Select a stat…' : 'No stats available'}</option>
                      {computedStatOptions.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                  {selectedStat && (
                    <div className="pb-2 flex items-center gap-2">
                      <span className="text-sm text-gray-700">
                        {selectedPlayerId && selectedPlayerId !== TEAM_AGG_ID
                          ? (playersById[selectedPlayerId]?.longName || selectedPlayerId)
                          : selectedTeamAbv
                            ? `${selectedTeamAbv} total`
                            : 'All players total'}
                      </span>
                      <span className="text-sm text-gray-700">— Value:</span>
                      <span className="text-sm font-semibold">{String(getSelectedPlayerStatValue())}</span>
                    </div>
                  )}
                </div>

                {Array.isArray(status?.games) && (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-gray-700">Filtered readout</summary>
                    <pre className="mt-2 p-2 bg-gray-50 border rounded overflow-auto text-xs">
{JSON.stringify(filteredData, null, 2)}
                    </pre>
                  </details>
                )}
                {rawBoxscore && (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-gray-700">Raw MLB Boxscore</summary>
                    <pre className="mt-2 p-2 bg-gray-50 border rounded overflow-auto text-xs">
{JSON.stringify(rawBoxscore, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            )}

            {/* Render a compact summary table */}
            {(() => {
              const games = Array.isArray(status?.games) ? status.games : [];
              if (!games.length) return null;
              return (
                <div className="mt-4">
                  <h3 className="text-base font-semibold mb-2">Games on {effectiveScoreboardDate} ({timeZone})</h3>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-xs sm:text-sm border">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="text-left px-2 py-2 border-b">Game</th>
                          <th className="text-left px-2 py-2 border-b">Score</th>
                          <th className="text-left px-2 py-2 border-b">Status</th>
                          <th className="text-left px-2 py-2 border-b">Time ({timeZone})</th>
                        </tr>
                      </thead>
                      <tbody>
                        {games.map((g) => {
                          const away = g.away || g.awayTeam || '';
                          const home = g.home || g.homeTeam || '';
                          const awayR = g?.lineScore?.away?.R ?? '';
                          const homeR = g?.lineScore?.home?.R ?? '';
                          const statusTxt = g.currentInning || g.gameStatus || '';
                          const timeTxt = g.gameTime || '';
                          let timeLocal = timeTxt;
                          try {
                            if (timeTxt) {
                              const dtf = new Intl.DateTimeFormat('en-US', { timeZone, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
                              timeLocal = dtf.format(new Date(timeTxt));
                            }
                          } catch {}
                          const id = g.id || g.gameID;
                          return (
                            <tr key={id} className="odd:bg-white even:bg-gray-50">
                              <td className="px-2 py-2 border-b whitespace-nowrap">{away}@{home}</td>
                              <td className="px-2 py-2 border-b">{awayR} - {homeR}</td>
                              <td className="px-2 py-2 border-b">{statusTxt}</td>
                              <td className="px-2 py-2 border-b">{timeLocal}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </section>
    </div>
  );
}


