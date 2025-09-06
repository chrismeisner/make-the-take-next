import { useState, useMemo, useEffect } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { useRouter } from "next/router";

export default function ApiTesterPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [source, setSource] = useState('major-mlb');
  const [nflYear, setNflYear] = useState(new Date().getFullYear());
  const [nflWeek, setNflWeek] = useState(1);
  const [checking, setChecking] = useState(false);
  const [status, setStatus] = useState(null);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0,10));
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
  const [timeZone, setTimeZone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
  const [copiedRequestUrl, setCopiedRequestUrl] = useState(false);
  const [nflMode, setNflMode] = useState('players');

  // Read initial state from URL query once
  useEffect(() => {
    if (!router.isReady) return;
    try {
      const q = router.query || {};
      const getStr = (v) => Array.isArray(v) ? v[0] : v;
      const qsSource = getStr(q.source);
      const qsDate = getStr(q.date);
      const qsTZ = getStr(q.timeZone);
      const qsYear = getStr(q.nflYear);
      const qsWeek = getStr(q.nflWeek);
      if (qsSource === 'major-mlb' || qsSource === 'nfl') setSource(qsSource);
      if (qsDate && /^\d{4}-\d{2}-\d{2}$/.test(qsDate)) {
        setDate(qsDate);
      }
      if (qsTZ) setTimeZone(qsTZ);
      if (qsYear && /^\d{4}$/.test(qsYear)) setNflYear(Number(qsYear));
      if (qsWeek && /^\d{1,2}$/.test(qsWeek)) setNflWeek(Number(qsWeek));
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady]);

  // Persist core controls to URL (shallow) for shareable state
  useEffect(() => {
    if (!router.isReady) return;
    const nextQuery = {
      ...(source ? { source } : {}),
      ...(source === 'major-mlb' ? (date ? { date } : {}) : {}),
      ...(source === 'nfl' ? { nflYear: String(nflYear || ''), nflWeek: String(nflWeek || '') } : {}),
    };
    const curr = router.query || {};
    const same = Object.keys(nextQuery).length === Object.keys(curr).length && Object.keys(nextQuery).every((k) => String(curr[k] || '') === String(nextQuery[k] || ''));
    if (same) return;
    router.replace({ pathname: router.pathname, query: nextQuery }, undefined, { shallow: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady, source, date, nflYear, nflWeek]);

  // Keep internal timeZone aligned with the user's local zone for readout and formatting
  const localTZ = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local';
  useEffect(() => {
    setTimeZone(localTZ);
  }, [localTZ]);

  // Removed auto-check for NFL; use the button instead

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

  const nflTeamStatOptions = useMemo(() => {
    if (source !== 'nfl' || !rawBoxscore || !selectedTeamAbv) return [];
    try {
      const teams = Array.isArray(rawBoxscore?.teams) ? rawBoxscore.teams : [];
      const abv = String(selectedTeamAbv).toUpperCase();
      const team = teams.find((t) => String(t?.team?.abbreviation || '').toUpperCase() === abv);
      const stats = Array.isArray(team?.statistics) ? team.statistics : [];
      const keys = stats.map((s) => String(s?.name || '')).filter(Boolean);
      return Array.from(new Set(keys)).sort((a, b) => a.localeCompare(b));
    } catch {
      return [];
    }
  }, [source, rawBoxscore, selectedTeamAbv]);

  function getSelectedTeamStatValue() {
    if (source !== 'nfl' || !rawBoxscore || !selectedTeamAbv || !selectedStat) return 0;
    const teams = Array.isArray(rawBoxscore?.teams) ? rawBoxscore.teams : [];
    const abv = String(selectedTeamAbv).toUpperCase();
    const team = teams.find((t) => String(t?.team?.abbreviation || '').toUpperCase() === abv);
    const stats = Array.isArray(team?.statistics) ? team.statistics : [];
    const entry = stats.find((s) => String(s?.name || '') === String(selectedStat));
    if (!entry) return 0;
    const v = entry?.value;
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    const dv = entry?.displayValue;
    const n = typeof dv === 'string' ? parseFloat(dv) : dv;
    return Number.isFinite(n) ? n : 0;
  }

  // Reset selected stat when changing the stat type to avoid mismatches
  useEffect(() => {
    setSelectedStat("");
  }, [statType]);

  // Keep statType aligned with league
  useEffect(() => {
    if (source === 'nfl' && statType !== 'all') {
      setStatType('all');
    } else if ((source === 'major-mlb' || source === 'mlb') && statType !== 'battingLine') {
      setStatType('battingLine');
    }
  }, [source]);

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
      params.set('source', source);
      if (source === 'major-mlb' || source === 'mlb') {
        if (date) {
          // convert YYYY-MM-DD -> YYYYMMDD
          params.set('gameDate', String(date).replace(/-/g, ''));
        }
      } else if (source === 'nfl') {
        params.set('year', String(nflYear));
        params.set('week', String(nflWeek));
      }
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

  // Initialize date to today based on local time zone on mount
  useEffect(() => {
    setDate(formatYMDInTZ(timeZone, new Date()));
  }, [timeZone]);

  // Auto-fetch players when an MLB event is selected so stat readouts have data
  useEffect(() => {
    if (!selectedGameId) return;
    if (!(source === 'major-mlb' || source === 'mlb')) return;
    if (playersLoading) return;
    const hasPlayers = Object.keys(playersById || {}).length > 0;
    if (hasPlayers) return;
    fetchPlayersForSelectedEvent();
  }, [selectedGameId, source]);

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

  

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">API Tester</h1>
        <Link href="/admin" className="text-sm text-blue-600 hover:underline">Back to Admin</Link>
      </div>

      <section className="border rounded-lg p-4">
        <h2 className="text-lg font-semibold mb-2">Connection Status</h2>
        <p className="text-sm text-gray-600 mb-3">Check connectivity to the external API source.</p>

        {/* Top: League selector only */}
        <div className="flex items-end gap-3 mb-3">
          <div>
            <label className="block text-sm font-medium text-gray-700">League</label>
            <select
              value={source}
              onChange={(e) => { setSource(e.target.value); setStatus(null); setSelectedGameId(""); setPlayersById({}); setShowPlayers(false); setSelectedStat(""); }}
              className="px-3 py-2 border rounded w-40"
            >
              <option value="major-mlb">MLB</option>
              <option value="nfl">NFL</option>
            </select>
          </div>
        </div>

        {/* Conditional controls under league */}
        {source === 'major-mlb' && (
          <div className="mb-3">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700">Date</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="px-3 py-2 border rounded"
                />
              </div>
              <div className="pb-2 text-sm text-gray-700">Times displayed in {localTZ}</div>
            </div>
            <button
              onClick={checkConnection}
              disabled={checking}
              className="mt-3 px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {checking ? "Checking..." : "Check Connection"}
            </button>
          </div>
        )}

        {source === 'nfl' && (
          <div className="mb-3">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700">NFL Year</label>
                <input
                  type="number"
                  value={nflYear}
                  onChange={(e) => setNflYear(Number(e.target.value) || new Date().getFullYear())}
                  className="px-3 py-2 border rounded w-28"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">NFL Week</label>
                <input
                  type="number"
                  min={1}
                  max={22}
                  value={nflWeek}
                  onChange={(e) => setNflWeek(Number(e.target.value) || 1)}
                  className="px-3 py-2 border rounded w-24"
                />
              </div>
              <div className="pb-2 text-sm text-gray-700">Times displayed in {localTZ}</div>
            </div>
            <button
              onClick={checkConnection}
              disabled={checking}
              className="mt-3 px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {checking ? "Checking..." : "Check Connection"}
            </button>
          </div>
        )}

        {status && (
          <div className="mt-3 text-sm">
            {status.success ? (
              <p className="text-green-700">Connected ✓{status.message ? ` — ${status.message}` : ""}</p>
            ) : (
              <p className="text-red-700">Connection failed: {status.error || "Unknown error"}</p>
            )}
            {status?.meta?.requestUrl && (
              <div className="mt-2">
                <div className="flex items-center gap-2">
                  <span className="text-gray-700">Request URL:</span>
                  <code className="text-xs break-all">{status.meta.requestUrl}</code>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(status.meta.requestUrl);
                        setCopiedRequestUrl(true);
                        setTimeout(() => setCopiedRequestUrl(false), 1000);
                      } catch {}
                    }}
                    className="px-2 py-1 text-xs bg-gray-200 rounded hover:bg-gray-300"
                  >
                    {copiedRequestUrl ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>
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

            {/* Events selector (MLB) */}
            {gamesForDate.length > 0 && (source === 'major-mlb' || source === 'mlb') && (
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
            {/* Events selector (NFL) */}
            {gamesForDate.length > 0 && source === 'nfl' && (
              <div className="mt-4 pt-4 border-t">
                <div className="flex flex-wrap items-end gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Event</label>
                    <select
                      value={selectedGameId}
                      onChange={async (e) => {
                        const id = e.target.value;
                        setSelectedGameId(id);
                        // Clear MLB-specific state
                        setShowPlayers(false);
                        setSelectedPlayerId("");
                        setSelectedTeamAbv("");
                        setNflMode('players');
                        setPlayersById({});
                        setAvailableStats([]);
                        setPlayersError("");
                        setRawBoxscore(null);
                        if (!id) return;
                        try {
                          const resp = await fetch(`/api/admin/api-tester/boxscore?source=nfl&gameID=${encodeURIComponent(id)}`);
                          const json = await resp.json();
                          if (!resp.ok || !json.success) throw new Error(json.error || `NFL box score failed (${resp.status})`);
                          setRawBoxscore(json?.data || null);
                          const map = json?.normalized?.playersById || {};
                          setPlayersById(map);
                          const keys = Array.isArray(json?.normalized?.statKeys) ? json.normalized.statKeys : [];
                          setAvailableStats(keys);
                          // Initialize team options and default selection
                          const g = gamesForDate.find((gg) => (gg.id || gg.gameID) === id) || {};
                          const away = g.away || g.awayTeam || '';
                          const home = g.home || g.homeTeam || '';
                          const teamAbvs = [away, home].filter(Boolean);
                          setEventTeamAbvs(teamAbvs);
                          if (teamAbvs.length && !selectedTeamAbv) {
                            setSelectedTeamAbv(teamAbvs[0]);
                          }
                          // Enrich positions using nflPlayers endpoint, but DO NOT add players
                          try {
                            if (teamAbvs.length) {
                              const rosterResp = await fetch(`/api/admin/api-tester/nflPlayers?teamAbv=${encodeURIComponent(teamAbvs.join(','))}`);
                              const rosterJson = await rosterResp.json();
                              if (rosterResp.ok && rosterJson.success && rosterJson.playersById) {
                                const rosterMap = rosterJson.playersById || {};
                                setPlayersById((prev) => {
                                  const merged = { ...prev };
                                  for (const [pid, p] of Object.entries(rosterMap)) {
                                    // Only enrich if this player already exists from the event box score
                                    if (merged[pid]) {
                                      merged[pid] = {
                                        ...merged[pid],
                                        longName: merged[pid].longName || p.longName || pid,
                                        pos: merged[pid].pos || p.pos || '',
                                        teamAbv: merged[pid].teamAbv || p.teamAbv || merged[pid].teamAbv || '',
                                      };
                                    }
                                  }
                                  return merged;
                                });
                              }
                            }
                          } catch {}
                          setShowPlayers(true);
                        } catch (err) {
                          setPlayersError(err.message || 'Failed to fetch NFL box score');
                        }
                      }}
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
                  {selectedGameId && (() => {
                    const g = gamesForDate.find((gg) => (gg.id || gg.gameID) === selectedGameId) || {};
                    const away = g.away || g.awayTeam || '';
                    const home = g.home || g.homeTeam || '';
                    const options = [away, home].filter(Boolean);
                    if (!options.length) return null;
                    return (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Team</label>
                        <select
                          value={selectedTeamAbv}
                          onChange={(e) => setSelectedTeamAbv(e.target.value)}
                          className="px-3 py-2 border rounded w-48"
                        >
                          <option value="">Select a team…</option>
                          {options.map((abv) => (
                            <option key={abv} value={abv}>{abv}</option>
                          ))}
                        </select>
                      </div>
                    );
                  })()}
                  {selectedGameId && selectedTeamAbv && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Selection</label>
                      <select
                        value={nflMode}
                        onChange={(e) => { setNflMode(e.target.value); setSelectedPlayerId(""); setSelectedStat(""); }}
                        className="px-3 py-2 border rounded w-40"
                      >
                        <option value="players">Players</option>
                        <option value="team">Team</option>
                      </select>
                    </div>
                  )}
                  {selectedGameId && selectedTeamAbv && nflMode === 'players' && Object.keys(playersById || {}).length > 0 && (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Players</label>
                        <select
                          value={selectedPlayerId}
                          onChange={(e) => setSelectedPlayerId(e.target.value)}
                          className="px-3 py-2 border rounded w-72"
                        >
                          <option value="">Select a player…</option>
                          <option value={TEAM_AGG_ID}>Whole team</option>
                          {Object.entries(playersById)
                            .filter(([, p]) => String(p?.teamAbv || '').toUpperCase() === String(selectedTeamAbv).toUpperCase())
                            .sort((a, b) => {
                              const an = a[1]?.longName || a[0];
                              const bn = b[1]?.longName || b[0];
                              return String(an).localeCompare(String(bn));
                            })
                            .map(([id, p]) => {
                              const name = p?.longName || id;
                              const pos = p?.pos || '';
                              return (
                                <option key={id} value={id}>{name}{pos ? ` (${pos})` : ''}</option>
                              );
                            })}
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
                    </>
                  )}
                  {selectedGameId && selectedTeamAbv && nflMode === 'team' && (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Stat</label>
                        <select
                          value={selectedStat}
                          onChange={(e) => setSelectedStat(e.target.value)}
                          className="px-3 py-2 border rounded w-72"
                          disabled={!nflTeamStatOptions.length}
                        >
                          <option value="">{nflTeamStatOptions.length ? 'Select a stat…' : 'No stats available'}</option>
                          {nflTeamStatOptions.map((s) => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      </div>
                      {selectedStat && (
                        <div className="pb-2 flex items-center gap-2">
                          <span className="text-sm text-gray-700">{selectedTeamAbv} team — Value:</span>
                          <span className="text-sm font-semibold">{String(getSelectedTeamStatValue())}</span>
                        </div>
                      )}
                    </>
                  )}
                </div>
                {rawBoxscore && source === 'nfl' && (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-gray-700">Raw NFL Boxscore</summary>
                    <pre className="mt-2 p-2 bg-gray-50 border rounded overflow-auto text-xs">
{JSON.stringify(rawBoxscore, null, 2)}
                    </pre>
                  </details>
                )}
                {selectedGameId && (() => {
                  const g = gamesForDate.find((gg) => (gg.id || gg.gameID) === selectedGameId) || {};
                  const away = g.away || g.awayTeam || '';
                  const home = g.home || g.homeTeam || '';
                  const awayR = g?.lineScore?.away?.R ?? '';
                  const homeR = g?.lineScore?.home?.R ?? '';
                  const statusTxt = g.gameStatus || g.currentInning || '';
                  const timeTxt = g.gameTime || '';
                  let timeLocal = timeTxt;
                  try {
                    if (timeTxt) {
                      const dtf = new Intl.DateTimeFormat('en-US', { timeZone, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
                      timeLocal = dtf.format(new Date(timeTxt));
                    }
                  } catch {}
                  return (
                    <div className="mt-3 border rounded p-3 text-sm">
                      <div className="font-semibold mb-1">Selected Event</div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
                        <div><span className="text-gray-600">Matchup:</span> {away}@{home}</div>
                        <div><span className="text-gray-600">Kickoff ({timeZone}):</span> {timeLocal || '—'}</div>
                        <div><span className="text-gray-600">Status:</span> {statusTxt || '—'}</div>
                        <div><span className="text-gray-600">Score:</span> {awayR} - {homeR}</div>
                      </div>
                    </div>
                  );
                })()}
                {selectedGameId && (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-gray-700">Filtered readout</summary>
                    <pre className="mt-2 p-2 bg-gray-50 border rounded overflow-auto text-xs">
{JSON.stringify(filteredData, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            )}

            {/* Players + Stat selectors (MLB only) */}
            {showPlayers && (source === 'major-mlb' || source === 'mlb') && (
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
                          const pos = playersById[p.id]?.pos || '';
                          const meta = [team, pos].filter(Boolean).join(', ');
                          return (
                            <option key={`${p.id}-${p.team}`} value={p.id}>{display}{meta ? ` (${meta})` : ''}</option>
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
                {rawBoxscore && (source === 'major-mlb' || source === 'mlb') && (
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


