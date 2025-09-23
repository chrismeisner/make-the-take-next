import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { useModal } from '../../contexts/ModalContext';

export default function CreatePropUnifiedPage() {
  const router = useRouter();
  const { packId, eventId } = router.query;
  const { openModal } = useModal();

  // Core prop fields
  const [propShort, setPropShort] = useState('');
  const [propSummary, setPropSummary] = useState('');
  const [propValueModel, setPropValueModel] = useState('vegas');
  const propType = 'moneyline';
  const [propSideAShort, setPropSideAShort] = useState('');
  const [propSideATake, setPropSideATake] = useState('');
  const [propSideAMoneyline, setPropSideAMoneyline] = useState('');
  const [propSideBShort, setPropSideBShort] = useState('');
  const [propSideBTake, setPropSideBTake] = useState('');
  const [propSideBMoneyline, setPropSideBMoneyline] = useState('');
  const [propStatus, setPropStatus] = useState('open');
  
  // Profit/payout from moneyline with default stake 250
  const profitFromMoneyline = (moneyline, stake = 250) => {
    const n = typeof moneyline === 'number' ? moneyline : parseFloat(moneyline);
    if (!Number.isFinite(n) || n === 0 || !Number.isFinite(stake)) return null;
    if (n > 0) return (n / 100) * stake;
    if (n < 0) return (100 / Math.abs(n)) * stake;
    return null;
  };
  const payoutFromMoneyline = (moneyline, stake = 250) => {
    const profit = profitFromMoneyline(moneyline, stake);
    return profit == null ? null : profit + stake;
  };
  const computedValueA = useMemo(() => {
    const p = profitFromMoneyline(propSideAMoneyline);
    return p == null ? null : Math.round(p);
  }, [propSideAMoneyline]);
  const computedValueB = useMemo(() => {
    const p = profitFromMoneyline(propSideBMoneyline);
    return p == null ? null : Math.round(p);
  }, [propSideBMoneyline]);

  // Linked event (from query or modal selection)
  const [event, setEvent] = useState(null);
  const [pack, setPack] = useState(null);
  const [packLoading, setPackLoading] = useState(false);
  const [packError, setPackError] = useState(null);
  const [packsForEvent, setPacksForEvent] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  // AI summary modal state (no inline controls)

  // Cover handling
  const [propCoverSource, setPropCoverSource] = useState('event'); // event | homeTeam | awayTeam | custom
  const [coverFile, setCoverFile] = useState(null);
  const [coverPreview, setCoverPreview] = useState(null);
  const [eventCoverUrl, setEventCoverUrl] = useState(null);
  const [teamCoverUrl, setTeamCoverUrl] = useState(null);
  // Pack multi-event cover selection support
  const [packEventIds, setPackEventIds] = useState([]);
  const [eventCoverMap, setEventCoverMap] = useState({}); // id -> { coverUrl, title }
  const [selectedEventCoverId, setSelectedEventCoverId] = useState('current');
  const [selectedAutoGradeEventId, setSelectedAutoGradeEventId] = useState(null);

  // Teams (league-scoped) and selection
  const [teamOptions, setTeamOptions] = useState([]);
  const [selectedTeams, setSelectedTeams] = useState([]);

  // Open/Close time
  const [propOpenTime, setPropOpenTime] = useState('');
  const [propCloseTime, setPropCloseTime] = useState('');

  // Auto grading (available when an event is linked)
  const [autoGradeKey, setAutoGradeKey] = useState('');
  // Data source for auto grading: 'major-mlb' | 'nfl'
  const [dataSource, setDataSource] = useState('major-mlb');
  const [formulaParamsText, setFormulaParamsText] = useState('');
  const [sideAComparator, setSideAComparator] = useState('gte');
  const [sideAThreshold, setSideAThreshold] = useState('');
  const [sideBComparator, setSideBComparator] = useState('lte');
  const [sideBThreshold, setSideBThreshold] = useState('');
  const [playersById, setPlayersById] = useState({});
  const [playersLoading, setPlayersLoading] = useState(false);
  const [playersError, setPlayersError] = useState('');
  const [metricOptions, setMetricOptions] = useState([]);
  const [metricLoading, setMetricLoading] = useState(false);
  const [metricError, setMetricError] = useState('');
  const [selectedMetric, setSelectedMetric] = useState('');
  const [selectedMetrics, setSelectedMetrics] = useState([]);
  // Team Winner mapping (A/B -> home/away)
  const [sideAMap, setSideAMap] = useState('');
  const [sideBMap, setSideBMap] = useState('');
  // Fallback NFL team metric catalog for future events (when live boxscore lacks statistics)
  const nflTeamMetricFallback = useMemo(() => ([
    'completionAttempts',
    'defensiveTouchdowns',
    'firstDowns',
    'firstDownsPassing',
    'firstDownsPenalty',
    'firstDownsRushing',
    'fourthDownEff',
    'fumblesLost',
    'interceptions',
    'netPassingYards',
    'possessionTime',
    'redZoneAttempts',
    'rushingAttempts',
    'rushingYards',
    'sacksYardsLost',
    'thirdDownEff',
    'totalDrives',
    'totalOffensivePlays',
    'totalPenaltiesYards',
    'totalYards',
    'turnovers',
    'yardsPerPass',
    'yardsPerPlay',
    'yardsPerRushAttempt',
  ]), []);
  const [teamAbvA, setTeamAbvA] = useState('');
  const [teamAbvB, setTeamAbvB] = useState('');
  const [formulaTeamAbv, setFormulaTeamAbv] = useState('');
  const [formulaPlayerId, setFormulaPlayerId] = useState('');
  // Human-friendly label for metric keys (camelCase/snake_case -> Title Case)
  const formatMetricLabel = (key) => {
    try {
      if (!key) return '';
      const s = String(key);
      if (s === s.toUpperCase() && s.length <= 3) return s; // Keep short acronyms like R/H/E/SO
      const noUnderscore = s.replace(/_/g, ' ');
      const spaced = noUnderscore.replace(/([a-z])([A-Z])/g, '$1 $2');
      const words = spaced.split(/\s+/).filter(Boolean);
      return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    } catch { return String(key || ''); }
  };
  // Player H2H (and similar) inputs
  const [playerAId, setPlayerAId] = useState('');
  const [playerBId, setPlayerBId] = useState('');
  const [winnerRule, setWinnerRule] = useState('higher');
  // Sample readout (preview)
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [previewData, setPreviewData] = useState(null);

  // Default open time to noon local today
  useEffect(() => {
    if (propOpenTime) return;
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    const pad = (n) => String(n).padStart(2, '0');
    const local = `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
    setPropOpenTime(local);
  }, [propOpenTime]);

  const formatDateTimeLocal = (iso) => {
    try {
      const d = new Date(iso);
      const pad = (n) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    } catch {
      return '';
    }
  };

  // Load event if eventId provided in route
  useEffect(() => {
    if (!eventId) return;
    (async () => {
      try {
        const res = await fetch(`/api/admin/events/${eventId}`);
        const data = await res.json();
        if (data?.success && data?.event) setEvent(data.event);
      } catch (e) {
        // noop
      }
    })();
  }, [eventId]);

  // Initialize/derive auto grade source from linked event league
  useEffect(() => {
    try {
      const leagueLc = String(event?.eventLeague || '').toLowerCase();
      const next = leagueLc === 'nfl' ? 'nfl' : 'major-mlb';
      try { console.log('[create-prop] derive dataSource from event', { eventLeague: event?.eventLeague, next }); } catch {}
      setDataSource(next);
    } catch {}
  }, [event?.eventLeague]);

  // Load packs linked to this event (PG supports packs.event_id)
  useEffect(() => {
    (async () => {
      try {
        if (!eventId) { setPacksForEvent([]); return; }
        const r = await fetch('/api/packs');
        const j = await r.json();
        if (!r.ok || !j?.success) { setPacksForEvent([]); return; }
        const list = Array.isArray(j.packs) ? j.packs : [];
        const filtered = list.filter(p => String(p.eventId || '') === String(eventId));
        setPacksForEvent(filtered);
      } catch { setPacksForEvent([]); }
    })();
  }, [eventId]);

  // When a pack is loaded, try to resolve its linked event (Postgres supports pack -> event)
  useEffect(() => {
    (async () => {
      if (!pack || event) return;
      try {
        const url = pack.packURL ? `/api/packs/${encodeURIComponent(pack.packURL)}` : null;
        if (!url) return;
        const r = await fetch(url);
        const j = await r.json();
        if (!r.ok || !j?.success || !j?.pack) return;
        try {
          const ids = Array.isArray(j.pack.packEventIds) ? j.pack.packEventIds : (j.pack.packEventId ? [j.pack.packEventId] : []);
          setPackEventIds(Array.from(new Set(ids.filter(Boolean))));
        } catch {}
        const evId = j.pack.packEventId;
        if (evId) {
          const evRes = await fetch(`/api/admin/events/${encodeURIComponent(evId)}`);
          const evJson = await evRes.json();
          if (evRes.ok && evJson?.success && evJson?.event) {
            setEvent(evJson.event);
          }
        }
      } catch {}
    })();
  }, [pack, event]);

  // Fallback: if admin pack endpoint surfaced event IDs directly, use them without requiring packURL
  useEffect(() => {
    (async () => {
      try {
        if (!pack || event) return;
        const ids = Array.isArray(pack.packEventIds) ? pack.packEventIds : (pack.packEventId ? [pack.packEventId] : []);
        if (ids.length > 0) {
          setPackEventIds((prev) => (prev && prev.length ? prev : Array.from(new Set(ids.filter(Boolean)))));
          if (pack.packEventId) {
            const evRes = await fetch(`/api/admin/events/${encodeURIComponent(pack.packEventId)}`);
            const evJson = await evRes.json();
            if (evRes.ok && evJson?.success && evJson?.event) {
              setEvent(evJson.event);
            }
          }
        }
      } catch {}
    })();
  }, [pack, event]);

  // Load titles and cover URLs for all pack-linked events
  useEffect(() => {
    (async () => {
      try {
        if (!Array.isArray(packEventIds) || packEventIds.length === 0) { setEventCoverMap({}); return; }
        const results = await Promise.all(packEventIds.map(async (id) => {
          try {
            const res = await fetch(`/api/admin/events/${encodeURIComponent(id)}`);
            const json = await res.json();
            if (!res.ok || !json?.success || !json?.event) return { id, coverUrl: null, title: id };
            const ev = json.event;
            let url = null;
            try {
              const fieldVal = ev.eventCover;
              if (Array.isArray(fieldVal) && fieldVal.length > 0) {
                for (const entry of fieldVal) {
                  if (entry && typeof entry === 'object') {
                    if (typeof entry.url === 'string' && entry.url.startsWith('http')) { url = entry.url; break; }
                    const thumb = entry?.thumbnails?.large?.url || entry?.thumbnails?.full?.url;
                    if (typeof thumb === 'string' && thumb.startsWith('http')) { url = thumb; break; }
                  } else if (typeof entry === 'string' && entry.startsWith('http')) {
                    url = entry; break;
                  }
                }
              }
              if (!url && typeof ev.eventCoverURL === 'string' && ev.eventCoverURL.startsWith('http')) url = ev.eventCoverURL;
              if (!url && typeof ev.cover_url === 'string' && ev.cover_url.startsWith('http')) url = ev.cover_url;
            } catch {}
            const title = ev.eventTitle || ev.title || id;
            return { id, coverUrl: url || null, title };
          } catch { return { id, coverUrl: null, title: id }; }
        }));
        const map = {};
        results.forEach((r) => { if (r && r.id) map[r.id] = { coverUrl: r.coverUrl, title: r.title }; });
        setEventCoverMap(map);
        // Default auto-grade event to the linked event if available; otherwise first pack event
        try {
          if (!selectedAutoGradeEventId) {
            const currentId = event?.id || eventId || null;
            if (currentId && map[currentId]) {
              setSelectedAutoGradeEventId(currentId);
            } else if (packEventIds.length > 0) {
              setSelectedAutoGradeEventId(packEventIds[0]);
            }
          }
        } catch {}
      } catch {}
    })();
  }, [packEventIds]);

  // Load pack details if packId is provided (Postgres admin flow passes pack UUID)
  useEffect(() => {
    if (!packId) return;
    setPackLoading(true);
    setPackError(null);
    (async () => {
      try {
        const res = await fetch(`/api/admin/packs/${encodeURIComponent(packId)}`);
        const data = await res.json();
        if (!res.ok || !data?.success || !data.pack) throw new Error(data?.error || 'Failed to load pack');
        setPack(data.pack);
      } catch (e) {
        setPackError(e.message || 'Failed to load pack');
        setPack(null);
      } finally {
        setPackLoading(false);
      }
    })();
  }, [packId]);

  // When event changes, compute cover URL and team options; set defaults
  useEffect(() => {
    if (!event?.id && !event?.eventLeague) { setEventCoverUrl(null); setTeamOptions([]); return; }
    // Event cover URL
    (async () => {
      try {
        const evId = event?.id || eventId;
        if (!evId) { setEventCoverUrl(null); return; }
        const r = await fetch(`/api/admin/events/${evId}`);
        const j = await r.json();
        if (j?.success && j?.event) {
          const ev = j.event;
          // Resolve event cover url
          let url = null;
          const fieldVal = ev.eventCover;
          if (Array.isArray(fieldVal) && fieldVal.length > 0) {
            for (const entry of fieldVal) {
              if (entry && typeof entry === 'object') {
                if (typeof entry.url === 'string' && entry.url.startsWith('http')) { url = entry.url; break; }
                const thumbUrl = entry?.thumbnails?.large?.url || entry?.thumbnails?.full?.url;
                if (typeof thumbUrl === 'string' && thumbUrl.startsWith('http')) { url = thumbUrl; break; }
              } else if (typeof entry === 'string' && entry.startsWith('http')) {
                url = entry; break;
              }
            }
          }
          setEventCoverUrl(url);
          // Teams by league
          try {
            const teamsRes = await fetch('/api/teams');
            const teamsJson = await teamsRes.json();
            if (teamsJson?.success) {
              const league = String(ev.eventLeague || '').toLowerCase();
              const matching = teamsJson.teams.filter(t => String(t.teamType || '').toLowerCase() === league);
              const opts = matching.length ? matching : teamsJson.teams;
              setTeamOptions(opts);
              const initial = [];
              if (ev.homeTeamLink) initial.push(...ev.homeTeamLink);
              if (ev.awayTeamLink) initial.push(...ev.awayTeamLink);
              setSelectedTeams(initial);
              if (ev?.eventTime) setPropCloseTime(formatDateTimeLocal(ev.eventTime));
            } else {
              setTeamOptions([]);
            }
          } catch { setTeamOptions([]); }
        } else {
          setEventCoverUrl(null);
        }
      } catch {
        setEventCoverUrl(null);
      }
    })();
  }, [event?.id, event?.eventLeague, event?.eventTime, eventId]);

  // Recompute team logo preview when source changes
  useEffect(() => {
    if (!event) { setTeamCoverUrl(null); return; }
    const pickFrom = propCoverSource === 'homeTeam' ? (event.homeTeamLink || []) : propCoverSource === 'awayTeam' ? (event.awayTeamLink || []) : [];
    const teamId = Array.isArray(pickFrom) && pickFrom.length ? pickFrom[0] : null;
    if (!teamId) { setTeamCoverUrl(null); return; }
    try {
      const t = teamOptions.find(team => String(team.recordId) === String(teamId));
      const url = t?.teamLogoURL || (Array.isArray(t?.teamLogo) && t.teamLogo[0]?.url) || null;
      setTeamCoverUrl(url || null);
    } catch {
      setTeamCoverUrl(null);
    }
  }, [propCoverSource, teamOptions, event?.homeTeamLink, event?.awayTeamLink]);

  // Removed Moneyline populate helper

  // Open AI summary modal
  const openAISummaryModal = () => {
    const evId = event?.id || eventId;
    if (!evId) { setError('Link an event to enable AI summary.'); return; }
    openModal('aiSummary', {
      eventId: evId,
      propShort,
      onGenerated: (text) => {
        if (typeof text === 'string') setPropSummary(text);
      },
    });
  };

  // Helpers for formula param JSON upserts
  const upsertRootParam = (key, value) => {
    try {
      const obj = formulaParamsText && formulaParamsText.trim() ? JSON.parse(formulaParamsText) : {};
      obj[key] = value;
      setFormulaParamsText(JSON.stringify(obj, null, 2));
    } catch {
      setFormulaParamsText(JSON.stringify({ [key]: value }, null, 2));
    }
  };
  const upsertSidesInParams = (newSides) => {
    try {
      const obj = formulaParamsText && formulaParamsText.trim() ? JSON.parse(formulaParamsText) : {};
      obj.sides = { ...(obj.sides || {}), ...newSides };
      setFormulaParamsText(JSON.stringify(obj, null, 2));
    } catch {
      setFormulaParamsText(JSON.stringify({ sides: newSides }, null, 2));
    }
  };

  // Metric options loading: prefer catalog API; fallback to boxscore-derived keys for legacy
  useEffect(() => {
    if (!(autoGradeKey && event?.espnGameID)) return;
    const gid = String(event.espnGameID || '').trim();
    if (!gid) return;
    const needsMetrics = ['stat_over_under', 'player_h2h', 'player_multi_stat_ou', 'player_multi_stat_h2h', 'team_stat_over_under', 'team_stat_h2h', 'team_multi_stat_ou', 'team_multi_stat_h2h'].includes(autoGradeKey);
    try { console.log('[create-prop] metric load check', { espnGameID: gid, autoGradeKey, dataSource, needsMetrics }); } catch {}
    if (!needsMetrics) return;
    setMetricLoading(true);
    setMetricError('');
    setMetricOptions([]);
    (async () => {
      try {
        const source = dataSource || 'major-mlb';
        const entity = (autoGradeKey.startsWith('team_')) ? 'team' : 'player';
        const scope = (autoGradeKey.includes('_multi_')) ? 'multi' : 'single';
        // 1) Try catalog API
        const catUrl = `/api/admin/metrics?league=${encodeURIComponent(source)}&entity=${encodeURIComponent(entity)}&scope=${encodeURIComponent(scope)}`;
        const cat = await fetch(catUrl);
        const catJson = await cat.json().catch(() => ({}));
        let keys = Array.isArray(catJson?.metrics) && catJson.metrics.length ? catJson.metrics.map(m => m.key) : [];
        // 2) Fallback to boxscore-derived keys for team metrics
        if (!keys.length) {
          try { console.log('[create-prop] fetch stat keys (fallback boxscore)', { source, gid, autoGradeKey }); } catch {}
          const resp = await fetch(`/api/admin/api-tester/boxscore?source=${encodeURIComponent(source)}&gameID=${encodeURIComponent(gid)}`);
          const json = await resp.json();
          keys = Array.isArray(json?.normalized?.statKeys) ? json.normalized.statKeys : [];
          // MLB team metrics convenience keys
          if ((autoGradeKey === 'team_stat_over_under' || autoGradeKey === 'team_stat_h2h') && source === 'major-mlb') {
            keys = Array.from(new Set([...(keys || []), 'R', 'H', 'E']));
          }
          // NFL team metrics from raw boxscore teams[].statistics[].name when Team Stat O/U or team multi-stat selected
          if ((autoGradeKey === 'team_stat_over_under' || autoGradeKey === 'team_stat_h2h' || autoGradeKey === 'team_multi_stat_ou' || autoGradeKey === 'team_multi_stat_h2h') && source === 'nfl') {
            try {
              const teams = Array.isArray(json?.data?.teams) ? json.data.teams : [];
              const nflTeamKeys = [];
              for (const t of teams) {
                const stats = Array.isArray(t?.statistics) ? t.statistics : [];
                for (const s of stats) {
                  const name = String(s?.name || '').trim();
                  if (name) nflTeamKeys.push(name);
                }
              }
              if (nflTeamKeys.length) {
                const uniq = Array.from(new Set(nflTeamKeys));
                keys = uniq;
              }
            } catch {}
            // Always include curated manual metrics and 'points' alongside dynamic options
            keys = Array.from(new Set([...(keys || []), ...nflTeamMetricFallback, 'points']));
            // Sort for stable UX
            keys.sort((a, b) => String(a).localeCompare(String(b)));
          }
        }
        // MLB team metrics convenience keys
        setMetricOptions(keys);
        try { console.log('[create-prop] metric options set', { count: keys?.length || 0, sample: (keys || []).slice(0, 10) }); } catch {}
      } catch (e) {
        setMetricError(e.message || 'Failed to load stat keys');
      } finally {
        setMetricLoading(false);
      }
    })();
  }, [autoGradeKey, event?.espnGameID, dataSource]);

  // Load sample readout based on selected source and linked event
  useEffect(() => {
    (async () => {
      try {
        setPreviewError('');
        setPreviewData(null);
        if (!event) return;
        const gid = String(event.espnGameID || '').trim();
        try { console.log('[create-prop] preview load begin', { gid, dataSource, autoGradeKey, selectedMetric, selectedMetrics }); } catch {}
        setPreviewLoading(true);
        const ds = dataSource || 'major-mlb';
        // If the event's league is known, wait until the selected dataSource matches it to avoid fetching wrong league endpoints initially
        try {
          const leagueLc = String(event?.eventLeague || '').toLowerCase();
          const expected = leagueLc === 'nfl' ? 'nfl' : (leagueLc ? 'major-mlb' : ds);
          if (leagueLc && ds !== expected) {
            console.log('[create-prop] preview skipped until dataSource matches event league', { league: leagueLc, expected, ds });
            setPreviewLoading(false);
            return;
          }
        } catch {}
        // Track the exact endpoints used so developers can verify sources
        let boxscoreUrl = null;
        let statusUrl = null;
        let espnScoreboardUrl = null;
        // For MLB, try to fetch scoreboard readout for the event date
        let scoreboard = null;
        if (ds === 'major-mlb') {
          try {
            let yyyymmdd = '';
            try {
              const d = new Date(event.eventTime);
              const yr = d.getFullYear();
              const mo = String(d.getMonth() + 1).padStart(2, '0');
              const da = String(d.getDate()).padStart(2, '0');
              yyyymmdd = `${yr}${mo}${da}`;
            } catch {}
            if (yyyymmdd) {
              const sp = new URLSearchParams();
              sp.set('source', 'major-mlb');
              sp.set('gameDate', yyyymmdd);
              statusUrl = `/api/admin/api-tester/status?${sp.toString()}`;
              const resp = await fetch(statusUrl);
              const json = await resp.json();
              if (resp.ok && json?.games) {
                // Try to match to our game by ESPN ID, otherwise by home/away team abv
                const homeAbv = String(event?.homeTeamAbbreviation || (Array.isArray(event?.homeTeam) ? event.homeTeam[0] : event?.homeTeam) || '').toUpperCase();
                const awayAbv = String(event?.awayTeamAbbreviation || (Array.isArray(event?.awayTeam) ? event.awayTeam[0] : event?.awayTeam) || '').toUpperCase();
                const byId = gid ? json.games.find(g => String(g?.id || g?.gameID || g?.gameId || '').trim() === gid) : null;
                const byTeams = (!byId && (homeAbv || awayAbv)) ? json.games.find(g => String(g?.home || g?.homeTeam || '').toUpperCase() === homeAbv && String(g?.away || g?.awayTeam || '').toUpperCase() === awayAbv) : null;
                scoreboard = byId || byTeams || json.games[0] || null;
              }
            }
          } catch {}
        }
        // For NFL who_wins preview, or when team views need points, fetch ESPN weekly scoreboard
        let espnWeekly = null;
        try {
          const isTeamView = ['team_stat_over_under','team_stat_h2h','team_multi_stat_ou','team_multi_stat_h2h'].includes(autoGradeKey);
          const needsPoints = String(selectedMetric || '').toLowerCase() === 'points' || (Array.isArray(selectedMetrics) && selectedMetrics.map(s=>String(s||'').toLowerCase()).includes('points'));
          const needsWeekly = (ds === 'nfl') && (autoGradeKey === 'who_wins' || (isTeamView && needsPoints));
          if (needsWeekly) {
            const yr = (() => { try { return new Date(event.eventTime).getFullYear(); } catch { return new Date().getFullYear(); } })();
            const wk = event?.eventWeek || '';
            const u = new URL('https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard');
            u.searchParams.set('year', String(yr));
            if (wk) u.searchParams.set('week', String(wk));
            espnScoreboardUrl = u.toString();
            const r = await fetch(espnScoreboardUrl);
            const j = await r.json();
            espnWeekly = j || null;
          }
        } catch {}

        // Fetch boxscore normalized stats for selected source
        let normalized = { playersById: {}, statKeys: [] };
        let rawTeams = [];
        try {
          if (gid) {
            boxscoreUrl = `/api/admin/api-tester/boxscore?source=${encodeURIComponent(ds)}&gameID=${encodeURIComponent(gid)}`;
          } else if (ds === 'major-mlb' && scoreboard && (scoreboard.id || scoreboard.gameID || scoreboard.gameId)) {
            const idFromBoard = String(scoreboard.id || scoreboard.gameID || scoreboard.gameId);
            boxscoreUrl = `/api/admin/api-tester/boxscore?source=${encodeURIComponent(ds)}&gameID=${encodeURIComponent(idFromBoard)}`;
          }
          if (boxscoreUrl) {
            try { console.log('[create-prop] fetch boxscore for preview', { boxscoreUrl }); } catch {}
            const bs = await fetch(boxscoreUrl);
            const bj = await bs.json();
            if (bs.ok && bj?.normalized) {
              normalized = bj.normalized;
            }
            try {
              if (ds === 'nfl') {
                rawTeams = Array.isArray(bj?.data?.teams) ? bj.data.teams : [];
              }
            } catch {}
            // NFL roster fallback: if no players found in normalized map, fetch team rosters and synthesize playersById
            try {
              if (ds === 'nfl') {
                const count = Object.keys(normalized?.playersById || {}).length;
                if (!count) {
                  // Resolve abbreviations robustly and only proceed when we have validated ABVs from teamOptions
                  const rawHome = event?.homeTeamAbbreviation || (Array.isArray(event?.homeTeam) ? event.homeTeam[0] : event?.homeTeam);
                  const rawAway = event?.awayTeamAbbreviation || (Array.isArray(event?.awayTeam) ? event.awayTeam[0] : event?.awayTeam);
                  const toAbvBestEffort = (val) => {
                    const raw = String(val || '').toUpperCase();
                    // If it already looks like an abv, keep it
                    if (/^[A-Z]{2,4}$/.test(raw)) return raw;
                    // Else try resolver
                    return (typeof abvResolver?.toAbv === 'function') ? abvResolver.toAbv(raw) : raw;
                  };
                  const homeAbvResolved = toAbvBestEffort(rawHome);
                  const awayAbvResolved = toAbvBestEffort(rawAway);
                  const abvs = [homeAbvResolved, awayAbvResolved].filter((s) => !!s && /^[A-Z]{2,4}$/.test(String(s)));
                  if (abvs.length) {
                    const rosterUrl = `/api/admin/api-tester/nflPlayers?teamAbv=${encodeURIComponent(abvs.join(','))}`;
                    try { console.log('[create-prop] NFL roster fallback', { rosterUrl, abvs }); } catch {}
                    const r = await fetch(rosterUrl);
                    const j = await r.json().catch(() => ({}));
                    if (r.ok && j?.playersById && typeof j.playersById === 'object') {
                      normalized = { ...(normalized || {}), playersById: j.playersById, statKeys: Array.isArray(normalized?.statKeys) ? normalized.statKeys : [] };
                    }
                  }
                }
              }
            } catch {}
          }
        } catch {}
        setPreviewData({ source: ds, scoreboard, normalized, rawTeams, espnWeekly, endpoints: { boxscoreUrl, statusUrl, espnScoreboardUrl } });
        try { console.log('[create-prop] preview loaded', { source: ds, players: Object.keys(normalized?.playersById || {}).length, statKeys: (normalized?.statKeys || []).length }); } catch {}
      } catch (e) {
        setPreviewError(e?.message || 'Failed to load preview');
      } finally {
        setPreviewLoading(false);
      }
    })();
  }, [event?.espnGameID, event?.eventTime, event?.eventWeek, event?.homeTeamAbbreviation, event?.awayTeamAbbreviation, dataSource, autoGradeKey, selectedMetric, teamOptions]);

  // Team abv options derived from event
  const normalizeAbv = (val) => {
    const v = String(val || '').toUpperCase();
    const map = { CWS:'CHW', SDP:'SD', SFG:'SF', TBR:'TB', KCR:'KC', ARZ:'ARI', WSN:'WSH' };
    return map[v] || v;
  };
  // Resolve a wide variety of team identifiers (full name, short name, nickname, or abv) to the official abbreviation for the current league
  const abvResolver = useMemo(() => {
    try {
      const nameToAbv = new Map();
      const nicknameCandidates = (name) => {
        try {
          const tokens = String(name || '').trim().toUpperCase().split(/\s+/).filter(Boolean);
          if (tokens.length >= 2) {
            const last = tokens[tokens.length - 1];
            const lastTwo = tokens.slice(-2).join(' ');
            return [last, lastTwo];
          }
          return tokens;
        } catch { return []; }
      };
      (teamOptions || []).forEach((t) => {
        const abv = String(t?.teamAbbreviation || '').toUpperCase();
        if (!abv) return;
        nameToAbv.set(abv, abv);
        const full = String(t?.teamName || t?.teamNameFull || '').toUpperCase();
        const short = String(t?.teamNameShort || '').toUpperCase();
        if (full) {
          nameToAbv.set(full, abv);
          nicknameCandidates(full).forEach((n) => { if (n) nameToAbv.set(n, abv); });
        }
        if (short) {
          nameToAbv.set(short, abv);
          nicknameCandidates(short).forEach((n) => { if (n) nameToAbv.set(n, abv); });
        }
      });
      const normalizeMlb = (val) => normalizeAbv ? normalizeAbv(val) : String(val || '').toUpperCase();
      return {
        toAbv: (val) => {
          const raw = String(val || '').toUpperCase();
          if (!raw) return '';
          const mlbNorm = normalizeMlb(raw);
          return nameToAbv.get(mlbNorm) || nameToAbv.get(raw) || mlbNorm;
        },
      };
    } catch { return { toAbv: (v) => String(v || '').toUpperCase() }; }
  }, [teamOptions]);
  const homeTeamName = Array.isArray(event?.homeTeam) ? (event?.homeTeam?.[0] || '') : (event?.homeTeam || '');
  const awayTeamName = Array.isArray(event?.awayTeam) ? (event?.awayTeam?.[0] || '') : (event?.awayTeam || '');

  // Prefill labels/takes for Team Winner based on A/B mapping (only when empty)
  useEffect(() => {
    if (autoGradeKey !== 'who_wins') return;
    try {
      const isValidMap = (m) => m === 'home' || m === 'away';
      if (!isValidMap(sideAMap) || !isValidMap(sideBMap) || sideAMap === sideBMap) return;
      const teamNameFor = (map) => (map === 'home' ? homeTeamName : awayTeamName);
      const teamA = teamNameFor(sideAMap)?.toString().trim();
      const teamB = teamNameFor(sideBMap)?.toString().trim();
      if (!teamA || !teamB || teamA === teamB) return;
      if (!propShort) setPropShort('Who Wins?');
      // Labels: fill blanks; if both equal to same team, correct both
      if (!propSideAShort) setPropSideAShort(teamA);
      if (!propSideBShort) setPropSideBShort(teamB);
      if (propSideAShort && propSideBShort && propSideAShort === propSideBShort) {
        if (propSideAShort === homeTeamName || propSideAShort === awayTeamName) {
          setPropSideAShort(teamA);
          setPropSideBShort(teamB);
        }
      }
      // Takes: fill blanks; if both equal, correct to expected
      const takeAExpected = `${teamA} beat the ${teamB}`;
      const takeBExpected = `${teamB} beat the ${teamA}`;
      if (!propSideATake) setPropSideATake(takeAExpected);
      if (!propSideBTake) setPropSideBTake(takeBExpected);
      if (propSideATake && propSideBTake && propSideATake === propSideBTake) {
        setPropSideATake(takeAExpected);
        setPropSideBTake(takeBExpected);
      }
    } catch {}
  }, [autoGradeKey, dataSource, sideAMap, sideBMap, homeTeamName, awayTeamName]);

  // Keep selectedMetric in sync with formulaParamsText when it changes externally
  useEffect(() => {
    try {
      const obj = formulaParamsText && formulaParamsText.trim() ? JSON.parse(formulaParamsText) : {};
      const next = String(obj.metric || '');
      if (next !== selectedMetric) setSelectedMetric(next);
      if (Array.isArray(obj.metrics)) {
        const uniq = Array.from(new Set(obj.metrics.filter(Boolean)));
        const same = uniq.length === selectedMetrics.length && uniq.every((v, i) => v === selectedMetrics[i]);
        if (!same) setSelectedMetrics(uniq);
      }
    } catch {}
  }, [formulaParamsText]);

  // Inject unified schema fields into formula params based on selected auto grade type
  useEffect(() => {
    if (!autoGradeKey) return;
    try {
      const obj = formulaParamsText && formulaParamsText.trim() ? JSON.parse(formulaParamsText) : {};
      const source = dataSource || 'major-mlb';
      const assign = (k, v) => { obj[k] = v; };
      if (autoGradeKey === 'who_wins') {
        assign('entity', 'team');
        assign('statScope', 'single');
        assign('compare', 'h2h');
        if (!obj.metric) obj.metric = (source === 'nfl' ? 'points' : 'R');
        if (!obj.winnerRule) obj.winnerRule = 'higher';
      } else if (autoGradeKey === 'stat_over_under') {
        assign('entity', 'player');
        assign('statScope', 'single');
        assign('compare', 'ou');
      } else if (autoGradeKey === 'team_stat_over_under') {
        assign('entity', 'team');
        assign('statScope', 'single');
        assign('compare', 'ou');
      } else if (autoGradeKey === 'team_stat_h2h') {
        assign('entity', 'team');
        assign('statScope', 'single');
        assign('compare', 'h2h');
        if (!obj.winnerRule) obj.winnerRule = 'higher';
      } else if (autoGradeKey === 'player_h2h') {
        assign('entity', 'player');
        assign('statScope', 'single');
        assign('compare', 'h2h');
        if (!obj.winnerRule) obj.winnerRule = 'higher';
      } else if (autoGradeKey === 'player_multi_stat_ou') {
        assign('entity', 'player');
        assign('statScope', 'multi');
        assign('compare', 'ou');
      } else if (autoGradeKey === 'player_multi_stat_h2h') {
        assign('entity', 'player');
        assign('statScope', 'multi');
        assign('compare', 'h2h');
        if (!obj.winnerRule) obj.winnerRule = 'higher';
      } else if (autoGradeKey === 'team_multi_stat_ou') {
        assign('entity', 'team');
        assign('statScope', 'multi');
        assign('compare', 'ou');
      } else if (autoGradeKey === 'team_multi_stat_h2h') {
        assign('entity', 'team');
        assign('statScope', 'multi');
        assign('compare', 'h2h');
        if (!obj.winnerRule) obj.winnerRule = 'higher';
      }
      // Always ensure identity and source details are present when event/dataSource known
      if (event) {
        const gid = String(event?.espnGameID || '').trim();
        if (gid) obj.espnGameID = gid;
        if (event?.eventTime) {
          const d = new Date(event.eventTime);
          obj.gameDate = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
        }
      }
      if (source) obj.dataSource = source;
      setFormulaParamsText(JSON.stringify(obj, null, 2));
    } catch {}
  }, [autoGradeKey, dataSource, event?.espnGameID, event?.eventTime]);

  // Seed and maintain params for Team Winner (NFL-only)
  useEffect(() => {
    if (autoGradeKey !== 'who_wins') return;
    try {
      if (!sideAMap) setSideAMap('away');
      if (!sideBMap) setSideBMap('home');
    } catch {}
  }, [autoGradeKey]);
  useEffect(() => {
    if (autoGradeKey !== 'who_wins') return;
    try {
      const obj = formulaParamsText && formulaParamsText.trim() ? JSON.parse(formulaParamsText) : {};
      obj.entity = 'team';
      obj.statScope = 'single';
      obj.compare = 'h2h';
      const source = dataSource || 'major-mlb';
      if (!obj.metric) obj.metric = (source === 'nfl' ? 'points' : 'R');
      if (!obj.winnerRule) obj.winnerRule = 'higher';
      obj.whoWins = { sideAMap: sideAMap || '', sideBMap: sideBMap || '' };
      if (event) {
        const gid = String(event?.espnGameID || '').trim();
        if (gid) obj.espnGameID = gid;
        if (event?.eventTime && !obj.gameDate) {
          const d = new Date(event.eventTime);
          obj.gameDate = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
        }
      }
      obj.dataSource = source;
      setFormulaParamsText(JSON.stringify(obj, null, 2));
    } catch {}
  }, [autoGradeKey, sideAMap, sideBMap, dataSource, event?.espnGameID, event?.eventTime]);

  // Derived helpers for Player H2H selectors
  const teamOptionsH2H = useMemo(() => {
    try {
      const set = new Set();
      try {
        const map = previewData?.normalized?.playersById || {};
        Object.values(map).forEach((p) => { const abv = abvResolver.toAbv(p?.teamAbv); if (abv) set.add(abv); });
      } catch {}
      try {
        const eAway = abvResolver.toAbv(event?.awayTeamAbbreviation || event?.awayTeam);
        const eHome = abvResolver.toAbv(event?.homeTeamAbbreviation || event?.homeTeam);
        if (eAway) set.add(eAway);
        if (eHome) set.add(eHome);
      } catch {}
      return Array.from(set);
    } catch { return []; }
  }, [previewData?.normalized?.playersById, event?.awayTeamAbbreviation, event?.homeTeamAbbreviation, event?.awayTeam, event?.homeTeam, abvResolver]);

  const playersA = useMemo(() => {
    try {
      const entries = Object.entries(previewData?.normalized?.playersById || {});
      return entries
        .filter(([, p]) => String(p?.teamAbv || '').toUpperCase() === String(teamAbvA || '').toUpperCase())
        .sort((a, b) => String(a[1]?.longName || a[0]).localeCompare(String(b[1]?.longName || b[0])));
    } catch { return []; }
  }, [previewData?.normalized?.playersById, teamAbvA]);

  const playersB = useMemo(() => {
    try {
      const entries = Object.entries(previewData?.normalized?.playersById || {});
      return entries
        .filter(([, p]) => String(p?.teamAbv || '').toUpperCase() === String(teamAbvB || '').toUpperCase())
        .sort((a, b) => String(a[1]?.longName || a[0]).localeCompare(String(b[1]?.longName || b[0])));
    } catch { return []; }
  }, [previewData?.normalized?.playersById, teamAbvB]);

  const allPlayers = useMemo(() => {
    try {
      const entries = Object.entries(previewData?.normalized?.playersById || {});
      return entries.sort((a, b) => String(a[1]?.longName || a[0]).localeCompare(String(b[1]?.longName || b[0])));
    } catch { return []; }
  }, [previewData?.normalized?.playersById]);

  // Link Event modal for pack flow
  const openLinkEventModal = () => {
    openModal('addEvent', {
      allowMultiSelect: false,
      onEventSelected: (ev) => {
        try {
          const chosen = Array.isArray(ev) ? (ev[0] || null) : ev;
          if (!chosen?.id) { setEvent(null); return; }
          fetch(`/api/admin/events/${chosen.id}`)
            .then(r => r.json())
            .then(data => {
              if (data?.success && data?.event) {
                setEvent({ ...data.event, id: chosen.id, eventTitle: chosen.eventTitle });
              } else {
                setEvent({ id: chosen.id, eventTitle: chosen.eventTitle });
              }
            })
            .catch(() => setEvent(chosen));
        } catch {}
      },
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const linkedEventId = event?.id || eventId || null;
    if (!packId && !linkedEventId) {
      setError('Please link a pack or an event');
      return;
    }
    // Capture effective formula params for payload (avoid relying on async state updates)
    let finalFormulaParamsText = formulaParamsText;
    // Validate auto-grade formula for multi-stat before submit
    if (autoGradeKey === 'player_multi_stat_ou') {
      try {
        const obj = formulaParamsText && formulaParamsText.trim() ? JSON.parse(formulaParamsText) : {};
        const eff = { ...(obj || {}) };
        // Fill from current UI state if missing
        if (!Array.isArray(eff.metrics) || eff.metrics.filter(Boolean).length < 2) {
          const m = Array.isArray(selectedMetrics) ? selectedMetrics.filter(Boolean) : [];
          if (m.length >= 2) eff.metrics = m;
        }
        if (!eff.playerId && formulaPlayerId) {
          eff.playerId = formulaPlayerId;
        }
        if (!eff.espnGameID) {
          const gid = String(event?.espnGameID || '').trim();
          if (gid) eff.espnGameID = gid;
        }
        if (!eff.gameDate && event?.eventTime) {
          const d = new Date(event.eventTime);
          eff.gameDate = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
        }
        eff.entity = 'player';
        if (dataSource) eff.dataSource = dataSource;

        // Validate effective params
        const metrics = Array.isArray(eff.metrics) ? eff.metrics.filter(Boolean) : [];
        if (metrics.length < 2) { setError('Please select at least 2 metrics for Player Multi Stat O/U'); return; }
        if (!eff.playerId) { setError('Please select a player for Player Multi Stat O/U'); return; }
        const sides = eff.sides || {};
        const a = sides.A || {};
        const b = sides.B || {};
        if (!a.comparator || a.threshold == null || !b.comparator || b.threshold == null) { setError('Please configure both sides comparators and thresholds'); return; }
        if (!eff.espnGameID) { setError('Missing ESPN game ID on event'); return; }
        if (!eff.gameDate) { setError('Missing game date on event'); return; }

        // Persist effective params back to text for UI and capture for payload
        finalFormulaParamsText = JSON.stringify(eff, null, 2);
        setFormulaParamsText(finalFormulaParamsText);
      } catch {}
    }
    // Validate auto-grade formula for Player Single Stat O/U before submit
    if (autoGradeKey === 'stat_over_under') {
      try {
        const obj = formulaParamsText && formulaParamsText.trim() ? JSON.parse(formulaParamsText) : {};
        const eff = { ...(obj || {}) };
        // Ensure metric present
        if (!eff.metric && selectedMetric) {
          eff.metric = selectedMetric;
        }
        // Ensure playerId present (entity=player)
        const finalPlayerId = eff.playerId || formulaPlayerId || '';
        if (!finalPlayerId) { setError('Please select a player for Player Single Stat O/U'); return; }
        eff.playerId = finalPlayerId;
        // Ensure sides
        const sides = eff.sides || {};
        const a = sides.A || {}; const b = sides.B || {};
        if (!a.comparator || a.threshold == null || !b.comparator || b.threshold == null) {
          setError('Please configure both sides comparators and thresholds'); return;
        }
        eff.sides = { A: { comparator: a.comparator, threshold: Number(a.threshold) }, B: { comparator: b.comparator, threshold: Number(b.threshold) } };
        // Ensure IDs/time
        if (!eff.espnGameID) {
          const gid = String(event?.espnGameID || '').trim();
          if (gid) eff.espnGameID = gid;
        }
        if (!eff.gameDate && event?.eventTime) {
          const d = new Date(event.eventTime);
          eff.gameDate = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
        }
        eff.entity = 'player';
        if (dataSource) eff.dataSource = dataSource;
        // Validate required
        if (!eff.metric) { setError('Please select a metric for Player Single Stat O/U'); return; }
        if (!eff.espnGameID) { setError('Missing ESPN game ID on event'); return; }
        if (!eff.gameDate) { setError('Missing game date on event'); return; }
        // Persist effective params
        finalFormulaParamsText = JSON.stringify(eff, null, 2);
        setFormulaParamsText(finalFormulaParamsText);
      } catch {}
    }
    // Validate auto-grade formula for Player H2H before submit
    if (autoGradeKey === 'player_h2h') {
      try {
        const obj = formulaParamsText && formulaParamsText.trim() ? JSON.parse(formulaParamsText) : {};
        const eff = { ...(obj || {}) };
        // Ensure metric present
        if (!eff.metric && selectedMetric) {
          eff.metric = selectedMetric;
        }
        // Ensure player IDs present
        if (!eff.playerAId && playerAId) {
          eff.playerAId = playerAId;
        }
        if (!eff.playerBId && playerBId) {
          eff.playerBId = playerBId;
        }
        // Ensure IDs/time
        if (!eff.espnGameID) {
          const gid = String(event?.espnGameID || '').trim();
          if (gid) eff.espnGameID = gid;
        }
        if (!eff.gameDate && event?.eventTime) {
          const d = new Date(event.eventTime);
          eff.gameDate = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
        }
        // Winner rule and data source
        eff.winnerRule = String(eff.winnerRule || winnerRule || 'higher').toLowerCase();
        eff.entity = 'player';
        if (dataSource) eff.dataSource = dataSource;

        // Validate required
        if (!eff.metric) { setError('Please select a metric for Player H2H'); return; }
        if (!eff.playerAId || !eff.playerBId) { setError('Please select both players for Player H2H'); return; }
        if (!eff.espnGameID) { setError('Missing ESPN game ID on event'); return; }
        if (!eff.gameDate) { setError('Missing game date on event'); return; }

        // Persist effective params
        finalFormulaParamsText = JSON.stringify(eff, null, 2);
        setFormulaParamsText(finalFormulaParamsText);
      } catch {}
    }
    // Validate auto-grade formula for Player Multi Stat H2H before submit
    if (autoGradeKey === 'player_multi_stat_h2h') {
      try {
        const obj = formulaParamsText && formulaParamsText.trim() ? JSON.parse(formulaParamsText) : {};
        const eff = { ...(obj || {}) };
        // Ensure metrics present (>=2)
        const list = Array.isArray(eff.metrics) ? eff.metrics.filter(Boolean) : (Array.isArray(selectedMetrics) ? selectedMetrics.filter(Boolean) : []);
        if (list.length < 2) { setError('Please select at least 2 metrics for Player Multi Stat H2H'); return; }
        eff.metrics = list;
        // Ensure players present
        if (!eff.playerAId && playerAId) eff.playerAId = playerAId;
        if (!eff.playerBId && playerBId) eff.playerBId = playerBId;
        if (!eff.playerAId || !eff.playerBId) { setError('Please select both players for Player Multi Stat H2H'); return; }
        // IDs/time/source
        if (!eff.espnGameID) {
          const gid = String(event?.espnGameID || '').trim();
          if (gid) eff.espnGameID = gid;
        }
        if (!eff.gameDate && event?.eventTime) {
          const d = new Date(event.eventTime);
          eff.gameDate = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
        }
        eff.entity = 'player';
        eff.statScope = 'multi';
        eff.compare = 'h2h';
        eff.winnerRule = String(eff.winnerRule || winnerRule || 'higher').toLowerCase();
        if (dataSource) eff.dataSource = dataSource;
        if (!eff.espnGameID) { setError('Missing ESPN game ID on event'); return; }
        if (!eff.gameDate) { setError('Missing game date on event'); return; }
        finalFormulaParamsText = JSON.stringify(eff, null, 2);
        setFormulaParamsText(finalFormulaParamsText);
      } catch {}
    }
    // Validate Team Winner before submit
    if (autoGradeKey === 'who_wins') {
      try {
        const obj = formulaParamsText && formulaParamsText.trim() ? JSON.parse(formulaParamsText) : {};
        const eff = { ...(obj || {}) };
        const aMap = (eff?.whoWins?.sideAMap) || sideAMap || '';
        const bMap = (eff?.whoWins?.sideBMap) || sideBMap || '';
        if (!aMap || !bMap) { setError('Please map Take A and Take B to home/away.'); return; }
        eff.whoWins = { sideAMap: aMap, sideBMap: bMap };
        if (!eff.espnGameID) {
          const gid = String(event?.espnGameID || '').trim();
          if (gid) eff.espnGameID = gid;
        }
        if (!eff.gameDate && event?.eventTime) {
          const d = new Date(event.eventTime);
          eff.gameDate = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
        }
        eff.entity = 'team';
        eff.statScope = 'single';
        eff.compare = 'h2h';
        eff.metric = 'points';
        finalFormulaParamsText = JSON.stringify(eff, null, 2);
        setFormulaParamsText(finalFormulaParamsText);
      } catch {}
    }
    setLoading(true);
    setError(null);

    // Upload cover image if custom
    let propCoverUrl = null;
    if (propCoverSource === 'custom' && coverFile) {
      const toBase64 = (file) => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = (err) => reject(err);
      });
      try {
        const fileData = await toBase64(coverFile);
        const coverRes = await fetch('/api/admin/uploadPropCover', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename: coverFile.name, fileData })
        });
        const coverData = await coverRes.json();
        if (!coverData.success) throw new Error('Cover upload failed');
        propCoverUrl = coverData.url;
      } catch (uploadErr) {
        setError(uploadErr.message || 'Cover upload failed');
        setLoading(false);
        return;
      }
    } else if (propCoverSource === 'event' && selectedEventCoverId && selectedEventCoverId !== 'current') {
      const override = eventCoverMap[selectedEventCoverId]?.coverUrl || null;
      if (override) {
        // For alternate event cover selection, send the URL directly
        propCoverUrl = override;
      }
    }

    try {
      const payload = {
        propShort,
        propSummary,
        PropSideAShort: propSideAShort,
        PropSideATake: propSideATake,
        PropSideAMoneyline: propSideAMoneyline,
        PropSideBShort: propSideBShort,
        PropSideBTake: propSideBTake,
        PropSideBMoneyline: propSideBMoneyline,
        propValueModel,
        propType,
          propStatus,
        propOpenTime,
        propCloseTime,
        propCoverSource,
        ...(propCoverUrl ? { propCover: propCoverUrl } : {}),
        ...(packId ? { packId } : {}),
        // If pack has multiple events and an auto-grade event is chosen, honor it; else fallback to linkedEventId
        ...(selectedAutoGradeEventId ? { eventId: selectedAutoGradeEventId } : (linkedEventId ? { eventId: linkedEventId } : {})),
        ...(selectedTeams && selectedTeams.length ? { teams: selectedTeams } : {}),
      };
      if (linkedEventId) {
        payload.gradingMode = autoGradeKey ? 'auto' : 'manual';
        if (autoGradeKey) {
          payload.formulaKey = autoGradeKey;
          payload.formulaParams = finalFormulaParamsText || formulaParamsText || undefined;
        }
      }
      const res = await fetch('/api/props', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to create prop');
      // Redirect preference: if packId present, go back to pack edit; else to event page
      if (packId) {
        router.push(`/admin/packs/${packId}/edit`);
      } else if (linkedEventId) {
        router.push(`/admin/events/${linkedEventId}`);
      } else {
        router.push('/admin');
      }
    } catch (err) {
      setError(err.message || 'Failed to create prop');
    } finally {
      setLoading(false);
    }
  };

  // Odds fetch helpers
  const [oddsLoadingSide, setOddsLoadingSide] = useState(null);
  const [oddsError, setOddsError] = useState('');

  const fetchMoneylineForSide = async (side /* 'A' | 'B' */) => {
    try { setOddsError(''); } catch {}
    try { console.log('[OddsFetch] Clicked', { side, autoGradeKey, dataSource, eventId: event?.id, espnGameID: event?.espnGameID }); } catch {}
    try {
      if (autoGradeKey !== 'who_wins') {
        try { console.warn('[OddsFetch] Not Team Winner. Aborting.'); } catch {}
        setOddsError('Team Winner auto grade must be selected to fetch moneylines.');
        return;
      }
      const ds = dataSource || 'major-mlb';
      let eventIdToUse = String(event?.espnGameID || '').trim();
      // MLB fallback: derive ESPN event ID by matching scoreboard (date + home/away)
      if (!eventIdToUse && ds === 'major-mlb' && event?.eventTime) {
        try {
          const normalizeTeamAbv = (val) => {
            const v = String(val || '').toUpperCase();
            const map = {
              CWS: 'CHW',
              CHA: 'CHW',
              SDP: 'SD',
              SFG: 'SF',
              TBR: 'TB',
              TAM: 'TB',
              KCR: 'KC',
              ARZ: 'ARI',
              WSN: 'WSH',
              WAS: 'WSH',
              NYA: 'NYY',
              NYY: 'NYY',
              NYN: 'NYM',
              NYM: 'NYM',
              LAN: 'LAD',
              LAD: 'LAD',
              ANA: 'LAA',
              LAA: 'LAA',
              FLA: 'MIA',
              MIA: 'MIA',
            };
            return map[v] || v;
          };
          const d = new Date(event.eventTime);
          const yyyymmdd = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
          const u = new URLSearchParams(); u.set('source','major-mlb'); u.set('gameDate', yyyymmdd);
          const statusUrl = `/api/admin/api-tester/status?${u.toString()}`;
          console.log('[OddsFetch] MLB fallback: fetching status', { statusUrl });
          const r = await fetch(statusUrl);
          const j = await r.json();
          const games = Array.isArray(j?.games) ? j.games : [];
          const homeAbv = normalizeTeamAbv(event?.homeTeamAbbreviation || (Array.isArray(event?.homeTeam) ? event.homeTeam[0] : event?.homeTeam));
          const awayAbv = normalizeTeamAbv(event?.awayTeamAbbreviation || (Array.isArray(event?.awayTeam) ? event.awayTeam[0] : event?.awayTeam));
          const homeName = String(Array.isArray(event?.homeTeam) ? event.homeTeam[0] : event?.homeTeam || '').toUpperCase();
          const awayName = String(Array.isArray(event?.awayTeam) ? event.awayTeam[0] : event?.awayTeam || '').toUpperCase();
          const byAbv = (g) => (String(g?.home || g?.homeTeam || '').toUpperCase() === homeAbv && String(g?.away || g?.awayTeam || '').toUpperCase() === awayAbv);
          const byName = (g) => (String(g?.homeName || '').toUpperCase().includes(homeName) && String(g?.awayName || '').toUpperCase().includes(awayName));
          const match = games.find(g => byAbv(g) || byName(g));
          if (match && (match.id || match.gameID || match.gameId)) {
            eventIdToUse = String(match.id || match.gameID || match.gameId);
            console.log('[OddsFetch] MLB fallback: derived ESPN game ID', { eventIdToUse, homeAbv, awayAbv });
          } else {
            console.warn('[OddsFetch] MLB fallback: no scoreboard match found', { homeAbv, awayAbv, gamesCount: games.length });
          }
        } catch (e) {
          console.warn('[OddsFetch] MLB fallback error', e);
        }
      }
      if (!eventIdToUse) {
        try { console.warn('[OddsFetch] Missing espnGameID and unable to derive from MLB scoreboard', { event }); } catch {}
        setOddsError('Missing ESPN game ID on the linked event.');
        return;
      }
      const map = side === 'A' ? sideAMap : sideBMap;
      if (map !== 'home' && map !== 'away') {
        try { console.warn('[OddsFetch] Invalid side mapping', { side, map }); } catch {}
        setOddsError('Please map this side to Home/Away first.');
        return;
      }
      const league = String(ds) === 'nfl' ? 'football/nfl' : 'baseball/mlb';
      const providerId = '58'; // ESPN BET default
      setOddsLoadingSide(side);
      const url = `/api/admin/vegas-odds?eventId=${encodeURIComponent(eventIdToUse)}&league=${encodeURIComponent(league)}&providerId=${providerId}`;
      try { console.log('[OddsFetch] Request', { url, league, providerId, map, eventIdToUse }); } catch {}
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      try { console.log('[OddsFetch] Response status', { status: res.status }); } catch {}
      const json = await res.json().catch(() => ({}));
      try { console.log('[OddsFetch] Response body sample', { keys: Object.keys(json || {}), teams: json?.teams, home: json?.homeTeamOdds?.moneyLine, away: json?.awayTeamOdds?.moneyLine }); } catch {}
      if (!res.ok) {
        throw new Error(json?.error || `Failed to fetch odds (HTTP ${res.status})`);
      }
      const money = map === 'home' ? (json?.homeTeamOdds?.moneyLine) : (json?.awayTeamOdds?.moneyLine);
      if (money == null) {
        throw new Error('Moneyline not available for this provider.');
      }
      if (side === 'A') { setPropSideAMoneyline(String(money)); } else { setPropSideBMoneyline(String(money)); }
      try { console.log('[OddsFetch] Set moneyline', { side, map, money }); } catch {}
    } catch (e) {
      try { console.error('[OddsFetch] Error', e); } catch {}
      try { setOddsError(e?.message || 'Failed to fetch odds'); } catch {}
    } finally {
      try { setOddsLoadingSide(null); } catch {}
    }
  };

  return (
    <div className="p-4 max-w-6xl mx-auto">
      {/* Context blocks */}
      {(event || eventId) && (
        <div className="mb-4 p-4 bg-gray-100 rounded">
          <h2 className="text-xl font-semibold">Linked Event</h2>
          {event ? (
            <div className="mt-1 text-sm">
              <div className="font-medium">{event.eventTitle}</div>
              {event.eventTime && (<p>Time: {new Date(event.eventTime).toLocaleString()}</p>)}
              {event.eventLeague && (<p>League: {event.eventLeague}</p>)}
              {(() => {
                const gid = String(event?.espnGameID || '').trim();
                const league = String(event?.eventLeague || '').toLowerCase();
                if (!gid) return null;
                const url = `https://www.espn.com/${league}/game/_/gameId/${gid}`;
                return (
                  <a href={url} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">View on ESPN</a>
                );
              })()}
              {/* Team links on ESPN */}
              {(() => {
                try {
                  const leagueLc = String(event?.eventLeague || '').toLowerCase();
                  if (!leagueLc) return null;
                  const homeId = String(event?.homeTeamExternalId || '').trim();
                  const awayId = String(event?.awayTeamExternalId || '').trim();
                  const homeName = Array.isArray(event?.homeTeam) ? (event.homeTeam[0] || 'Home Team') : (event?.homeTeam || 'Home Team');
                  const awayName = Array.isArray(event?.awayTeam) ? (event.awayTeam[0] || 'Away Team') : (event?.awayTeam || 'Away Team');
                  const links = [];
                  if (homeId) {
                    const href = `https://www.espn.com/${leagueLc}/team/_/id/${encodeURIComponent(homeId)}`;
                    links.push(<div key="home-link"><a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">View {homeName} on ESPN</a></div>);
                  }
                  if (awayId) {
                    const href = `https://www.espn.com/${leagueLc}/team/_/id/${encodeURIComponent(awayId)}`;
                    links.push(<div key="away-link"><a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">View {awayName} on ESPN</a></div>);
                  }
                  return links.length ? (<div className="mt-2 space-y-1">{links}</div>) : null;
                } catch { return null; }
              })()}
              {packsForEvent.length > 0 && (
                <div className="mt-3">
                  <div className="text-sm font-semibold">Packs for this event</div>
                  <ul className="mt-1 list-disc list-inside space-y-1">
                    {packsForEvent.map((p) => (
                      <li key={p.airtableId} className="flex items-center gap-2">
                        <span>{p.packTitle || 'Untitled'}{p.packURL ? ` (${p.packURL})` : ''}</span>
                        <button
                          type="button"
                          className="px-2 py-0.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                          onClick={() => router.push(`/admin/packs/${encodeURIComponent(p.airtableId)}/edit`)}
                        >
                          Edit Pack
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <p>Loading event…</p>
          )}
        </div>
      )}
      {!!packId && (
        <div className="mb-4 p-4 bg-gray-100 rounded">
          <h2 className="text-xl font-semibold">Linked Pack</h2>
          {!pack && !packLoading && !packError && (
            <div className="mt-1 text-sm text-gray-700">ID: {packId}</div>
          )}
          {packLoading && (
            <div className="mt-1 text-sm text-gray-600">Loading pack…</div>
          )}
          {packError && (
            <div className="mt-1 text-sm text-red-600">{packError}</div>
          )}
          {pack && (
            <div className="mt-2 text-sm text-gray-800 space-y-1">
              <div><span className="font-medium">Title:</span> {pack.packTitle || 'Untitled'}</div>
              {pack.packURL && (<div><span className="font-medium">URL:</span> {pack.packURL}</div>)}
              {pack.packLeague && (<div><span className="font-medium">League:</span> {pack.packLeague}</div>)}
              {pack.packStatus && (<div><span className="font-medium">Status:</span> {pack.packStatus}</div>)}
              {(pack.packOpenTime || pack.packCloseTime) && (
                <div>
                  <span className="font-medium">Window:</span> {pack.packOpenTime ? new Date(pack.packOpenTime).toLocaleString() : '—'} → {pack.packCloseTime ? new Date(pack.packCloseTime).toLocaleString() : '—'}
                </div>
              )}
              {typeof pack.propsCount === 'number' && (<div><span className="font-medium">Props:</span> {pack.propsCount}</div>)}
              <div className="pt-1">
                <button
                  type="button"
                  className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
                  onClick={() => router.push(`/admin/packs/${encodeURIComponent(pack.airtableId)}/edit`)}
                >
                  Edit Pack
                </button>
              </div>
              {Array.isArray(packEventIds) && packEventIds.length > 0 && (
                <div className="mt-3">
                  <div className="text-sm font-semibold">Linked Events</div>
                  <ul className="mt-1 space-y-2">
                    {packEventIds.map((id) => (
                      <li key={`pack-ev-${id}`} className="flex items-center gap-3">
                        {eventCoverMap[id]?.coverUrl ? (
                          <img src={eventCoverMap[id].coverUrl} alt={eventCoverMap[id]?.title || id} className="h-10 w-10 object-cover rounded" />
                        ) : (
                          <div className="h-10 w-10 rounded bg-gray-200 flex items-center justify-center text-xs text-gray-500">—</div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="truncate">{eventCoverMap[id]?.title || id}</div>
                          <div className="text-xs text-gray-600 truncate">{id}</div>
                        </div>
                        <button
                          type="button"
                          className="px-2 py-1 text-xs bg-gray-100 rounded hover:bg-gray-200"
                          onClick={() => router.push(`/admin/events/${encodeURIComponent(id)}`)}
                        >
                          View
                        </button>
                        {(!event || id !== event.id) && (
                          <button
                            type="button"
                            className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                            onClick={async () => {
                              try {
                                const res = await fetch(`/api/admin/events/${encodeURIComponent(id)}`);
                                const json = await res.json();
                                if (res.ok && json?.success && json?.event) {
                                  setEvent(json.event);
                                  setSelectedAutoGradeEventId(id);
                                  // Auto populate Event Cover selection
                                  setPropCoverSource('event');
                                  setSelectedEventCoverId(id);
                                }
                              } catch {}
                            }}
                          >
                            Use for this prop
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
          {!event && (
            <div className="mt-3">
              <button
                type="button"
                className="px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                onClick={openLinkEventModal}
              >
                Select Event
              </button>
            </div>
          )}
        </div>
      )}

      {/* Prop cover source */}
      <div className="mb-4 p-4 border rounded bg-white">
        <div className="text-lg font-semibold">Prop Card Image Source</div>
        <label className="block text-sm font-medium text-gray-700 mt-2">Source</label>
        <select
          className="mt-1 block w-full border rounded px-2 py-1"
          value={propCoverSource}
          onChange={(e) => {
            const v = e.target.value;
            setPropCoverSource(v);
            if (v !== 'custom') { setCoverFile(null); setCoverPreview(null); }
          }}
        >
          <option value="event" disabled={!event}>Use event cover {event ? '' : '(link an event to enable)'}</option>
          <option value="homeTeam" disabled={!event}>Use home team logo</option>
          <option value="awayTeam" disabled={!event}>Use away team logo</option>
          <option value="custom">Custom upload</option>
        </select>
        {propCoverSource === 'event' && Array.isArray(packEventIds) && packEventIds.length > 1 && (
          <div className="mt-2">
            <label className="block text-sm font-medium text-gray-700">Event cover from</label>
            <select
              className="mt-1 block w-full border rounded px-2 py-1"
              value={selectedEventCoverId}
              onChange={(e) => setSelectedEventCoverId(e.target.value)}
            >
              <option value="current">{event?.eventTitle ? `${event.eventTitle} (linked)` : 'Linked event'}</option>
              {packEventIds
                .filter((id) => id !== (event?.id || eventId))
                .map((id) => (
                  <option key={id} value={id}>{eventCoverMap[id]?.title || id}</option>
                ))}
            </select>
          </div>
        )}
        {propCoverSource === 'event' && ((selectedEventCoverId && selectedEventCoverId !== 'current' && eventCoverMap[selectedEventCoverId]?.coverUrl) || eventCoverUrl) && (
          <div className="mt-2 text-xs text-gray-700">
            <div className="mb-1">URL:</div>
            <a href={((selectedEventCoverId && selectedEventCoverId !== 'current' && eventCoverMap[selectedEventCoverId]?.coverUrl) || eventCoverUrl)} target="_blank" rel="noopener noreferrer" className="block px-2 py-1 border rounded bg-gray-50 break-all">
              {((selectedEventCoverId && selectedEventCoverId !== 'current' && eventCoverMap[selectedEventCoverId]?.coverUrl) || eventCoverUrl)}
            </a>
          </div>
        )}
        {(propCoverSource === 'homeTeam' || propCoverSource === 'awayTeam') && teamCoverUrl && (
          <div className="mt-2 text-xs text-gray-700">
            <div className="mb-1">URL:</div>
            <a href={teamCoverUrl} target="_blank" rel="noopener noreferrer" className="block px-2 py-1 border rounded bg-gray-50 break-all">
              {teamCoverUrl}
            </a>
          </div>
        )}
        {propCoverSource === 'event' && (
          <div className="mt-2">
            <div className="text-sm text-gray-700">Preview</div>
            {(((selectedEventCoverId && selectedEventCoverId !== 'current' && eventCoverMap[selectedEventCoverId]?.coverUrl) || eventCoverUrl)) ? (
              <img src={((selectedEventCoverId && selectedEventCoverId !== 'current' && eventCoverMap[selectedEventCoverId]?.coverUrl) || eventCoverUrl)} alt="Event Cover" className="mt-2 h-32 object-contain" />
            ) : (
              <div className="mt-2 text-xs text-gray-500">No event cover available</div>
            )}
          </div>
        )}
        {(propCoverSource === 'homeTeam' || propCoverSource === 'awayTeam') && (
          <div className="mt-2">
            <div className="text-sm text-gray-700">Team Logo Preview</div>
            {teamCoverUrl ? (
              <img src={teamCoverUrl} alt="Team Logo" className="mt-2 h-32 object-contain" />
            ) : (
              <div className="mt-2 text-xs text-gray-500">No team logo available</div>
            )}
          </div>
        )}
        {propCoverSource === 'custom' && (
          <div className="mt-2">
            <label className="block text-sm font-medium text-gray-700">Upload Cover</label>
            <input
              type="file"
              accept="image/*"
              className="mt-1 block w-full"
              onChange={(e) => {
                const file = e.target.files && e.target.files[0];
                setCoverFile(file || null);
                setCoverPreview(file ? URL.createObjectURL(file) : null);
              }}
            />
            {coverPreview && (
              <img src={coverPreview} alt="Cover Preview" className="mt-2 h-32 object-contain" />
            )}
          </div>
        )}
      </div>

      {/* Event-only helpers */}
      {event && (
        <>
          <div className="mb-4 p-4 border rounded bg-white">
            <div className="text-lg font-semibold">Auto Grade</div>
            {Array.isArray(packEventIds) && packEventIds.length > 1 && (
              <div className="mt-2">
                <label className="block text-sm font-medium text-gray-700">Auto Grade Event</label>
                <select
                  className="mt-1 block w-full border rounded px-2 py-1"
                  value={selectedAutoGradeEventId || (event?.id || eventId) || ''}
                  onChange={async (e) => {
                    const id = e.target.value;
                    setSelectedAutoGradeEventId(id);
                    try {
                      if (id && id !== (event?.id || '')) {
                        const res = await fetch(`/api/admin/events/${encodeURIComponent(id)}`);
                        const json = await res.json();
                        if (res.ok && json?.success && json?.event) {
                          setEvent(json.event);
                        }
                      }
                    } catch {}
                  }}
                >
                  {packEventIds.map((id) => (
                    <option key={id} value={id}>{eventCoverMap[id]?.title || id}</option>
                  ))}
                </select>
              </div>
            )}
            <label className="block text-sm font-medium text-gray-700 mt-2">Auto Grade Source</label>
            <select
              className="mt-1 block w-full border rounded px-2 py-1"
              value={dataSource}
              onChange={(e) => {
                const v = e.target.value;
                setDataSource(v);
                // Persist into formula params so backend knows which source to use
                try {
                  const obj = formulaParamsText && formulaParamsText.trim() ? JSON.parse(formulaParamsText) : {};
                  obj.dataSource = v;
                  setFormulaParamsText(JSON.stringify(obj, null, 2));
                } catch {
                  setFormulaParamsText(JSON.stringify({ dataSource: v }, null, 2));
                }
              }}
            >
              <option value="major-mlb">MLB</option>
              <option value="nfl">NFL</option>
            </select>
            <label className="block text-sm font-medium text-gray-700 mt-2">Auto Grade Type</label>
            <select
              className="mt-1 block w-full border rounded px-2 py-1"
              value={autoGradeKey}
              onChange={(e) => { const v = e.target.value; try { console.log('[create-prop] autoGradeKey changed', { autoGradeKey: v }); } catch {} setAutoGradeKey(v); }}
            >
              <option value="">Manual Grade</option>
              <option value="stat_over_under">Player Single Stat O/U</option>
              <option value="team_stat_over_under">Team Single Stat O/U</option>
              <option value="team_stat_h2h">Team Stat H2H</option>
              <option value="player_h2h">Player H2H</option>
              <option value="player_multi_stat_ou">Player Multi Stat O/U</option>
              <option value="player_multi_stat_h2h">Player Multi Stat H2H</option>
              <option value="team_multi_stat_ou">Team Multi Stat O/U</option>
              <option value="team_multi_stat_h2h">Team Multi Stat H2H</option>
              {/* Team Winner supports NFL and MLB */}
              <option value="who_wins">Team Winner</option>
            </select>
            {/* Minimal params UI for common cases */}
            {false && <div />}
            {autoGradeKey === 'who_wins' && (
              <div className="mt-3 space-y-2">
                <div className="text-sm font-medium text-gray-700">Map takes to teams</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm">Take A Team</label>
                    <select
                      className="mt-1 block w-full border rounded px-2 py-1"
                      value={sideAMap}
                      onChange={(e) => setSideAMap(e.target.value)}
                    >
                      <option value="away">{Array.isArray(event?.awayTeam) ? (event?.awayTeam?.[0] || 'Away') : (event?.awayTeam || event?.awayTeamAbbreviation || 'Away')}</option>
                      <option value="home">{Array.isArray(event?.homeTeam) ? (event?.homeTeam?.[0] || 'Home') : (event?.homeTeam || event?.homeTeamAbbreviation || 'Home')}</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm">Take B Team</label>
                    <select
                      className="mt-1 block w-full border rounded px-2 py-1"
                      value={sideBMap}
                      onChange={(e) => setSideBMap(e.target.value)}
                    >
                      <option value="home">{Array.isArray(event?.homeTeam) ? (event?.homeTeam?.[0] || 'Home') : (event?.homeTeam || event?.homeTeamAbbreviation || 'Home')}</option>
                      <option value="away">{Array.isArray(event?.awayTeam) ? (event?.awayTeam?.[0] || 'Away') : (event?.awayTeam || event?.awayTeamAbbreviation || 'Away')}</option>
                    </select>
                  </div>
                </div>
                <div className="text-xs text-gray-600">Winner is determined by the final score from the linked event based on the selected source.</div>
              </div>
            )}
            {(autoGradeKey === 'stat_over_under' || autoGradeKey === 'team_stat_over_under' || autoGradeKey === 'team_stat_h2h') && (
              <div className="mt-3 space-y-3">
                {(autoGradeKey === 'team_stat_over_under') && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Team Abv</label>
                    <select
                      className="mt-1 block w-full border rounded px-2 py-1"
                      value={(function(){ try { const o=JSON.parse(formulaParamsText||'{}'); return o.teamAbv||''; } catch { return ''; } })()}
                      onChange={(e)=>{ try { const o = formulaParamsText && formulaParamsText.trim() ? JSON.parse(formulaParamsText) : {}; o.teamAbv = e.target.value; setFormulaParamsText(JSON.stringify(o, null, 2)); } catch {} }}
                    >
                      <option value="">Select team…</option>
                      {teamOptionsH2H.map((abv) => (<option key={`ou-team-${abv}`} value={abv}>{abv}</option>))}
                    </select>
                  </div>
                )}
                {false && <div />}
                {autoGradeKey === 'stat_over_under' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Team Abv</label>
                      <select
                        className="mt-1 block w-full border rounded px-2 py-1"
                        value={formulaTeamAbv}
                        onChange={(e)=>{ const v=e.target.value; try { console.log('[create-prop] team filter changed', { teamAbv: v }); } catch {} setFormulaTeamAbv(v); upsertRootParam('teamAbv', v); try { if (v && formulaPlayerId) { const pEntry = (previewData?.normalized?.playersById && previewData.normalized.playersById[formulaPlayerId]) || null; const team = String(pEntry?.teamAbv || '').toUpperCase(); if (team !== String(v).toUpperCase()) { setFormulaPlayerId(''); upsertRootParam('playerId',''); } } } catch {} }}
                      >
                        <option value="">(optional) Team filter</option>
                        {teamOptionsH2H.map((abv) => (<option key={`statou-team-${abv}`} value={abv}>{abv}</option>))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Player</label>
                      <select
                        className="mt-1 block w-full border rounded px-2 py-1"
                        value={formulaPlayerId}
                        onChange={(e)=>{ const v=e.target.value; setFormulaPlayerId(v); upsertRootParam('playerId', v); upsertRootParam('entity', 'player'); }}
                        disabled={!previewData?.normalized || Object.keys(previewData?.normalized?.playersById || {}).length === 0}
                      >
                        {(!previewData?.normalized || Object.keys(previewData?.normalized?.playersById || {}).length === 0) ? (
                          <option value="">No players found</option>
                        ) : (
                          <>
                            <option value="">Select a player…</option>
                            {Object.entries(previewData.normalized.playersById || {})
                              .filter(([id, p]) => {
                                const filt = abvResolver.toAbv(formulaTeamAbv);
                                if (!filt) return true;
                                return abvResolver.toAbv(p?.teamAbv) === filt;
                              })
                              .sort(([, a], [, b]) => String(a?.longName || '').localeCompare(String(b?.longName || '')))
                              .map(([id, p]) => (
                                <option key={`statou-player-${id}`} value={id}>{p?.longName || id} ({p?.teamAbv || ''})</option>
                              ))}
                          </>
                        )}
                      </select>
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Metric</label>
                    {metricLoading ? (
                      <div className="mt-1 text-xs text-gray-600">Loading metrics…</div>
                    ) : (
                      <select
                        className="mt-1 block w-full border rounded px-2 py-1"
                        value={selectedMetric}
                        onChange={(e)=> { setSelectedMetric(e.target.value); upsertRootParam('metric', e.target.value); }}
                        disabled={!metricOptions || metricOptions.length === 0}
                      >
                        <option value="">{metricOptions && metricOptions.length > 0 ? 'Select a metric…' : 'No metrics available'}</option>
                        {(metricOptions || []).map((k) => (<option key={k} value={k}>{formatMetricLabel(k)}</option>))}
                      </select>
                    )}
                    {!!metricError && <div className="mt-1 text-xs text-red-600">{metricError}</div>}
                  </div>
                </div>
                {autoGradeKey !== 'team_stat_h2h' && (
                  <div className="border rounded p-3 bg-gray-50">
                    <div className="text-sm font-medium text-gray-700 mb-2">Per-side grading rule</div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <div className="text-sm font-semibold mb-1">Side A</div>
                        <div className="flex items-center gap-2">
                          <select value={sideAComparator} onChange={(e) => { const v = e.target.value; setSideAComparator(v); upsertSidesInParams({ A: { comparator: v, threshold: Number(sideAThreshold) || 0 } }); }} className="border rounded px-2 py-1">
                            <option value="gte">Equal or more than</option>
                            <option value="lte">Equal or less than</option>
                          </select>
                          <input type="number" value={sideAThreshold} onChange={(e) => { const v = e.target.value; setSideAThreshold(v); upsertSidesInParams({ A: { comparator: sideAComparator, threshold: Number(v) || 0 } }); }} placeholder="e.g. 6" className="border rounded px-2 py-1 w-24" />
                        </div>
                      </div>
                      <div>
                        <div className="text-sm font-semibold mb-1">Side B</div>
                        <div className="flex items-center gap-2">
                          <select value={sideBComparator} onChange={(e) => { const v = e.target.value; setSideBComparator(v); upsertSidesInParams({ B: { comparator: v, threshold: Number(sideBThreshold) || 0 } }); }} className="border rounded px-2 py-1">
                            <option value="gte">Equal or more than</option>
                            <option value="lte">Equal or less than</option>
                          </select>
                          <input type="number" value={sideBThreshold} onChange={(e) => { const v = e.target.value; setSideBThreshold(v); upsertSidesInParams({ B: { comparator: sideBComparator, threshold: Number(v) || 0 } }); }} placeholder="e.g. 5" className="border rounded px-2 py-1 w-24" />
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
            {/* Removed duplicate OU team selector (now rendered above the metric block) */}
            {(autoGradeKey === 'team_stat_h2h' || autoGradeKey === 'team_multi_stat_h2h') && (
              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Team A Abv</label>
                  <select
                    className="mt-1 block w-full border rounded px-2 py-1"
                    value={(function(){ try { const o=JSON.parse(formulaParamsText||'{}'); return o.teamAbvA||''; } catch { return ''; } })()}
                    onChange={(e)=>{ const v=e.target.value; try { console.log('[create-prop] H2H team A changed', { teamAbvA: v }); } catch {} try { const o = formulaParamsText && formulaParamsText.trim() ? JSON.parse(formulaParamsText) : {}; o.teamAbvA = v; setFormulaParamsText(JSON.stringify(o, null, 2)); } catch {} }}
                  >
                    <option value="">Select team…</option>
                    {teamOptionsH2H.map((abv) => (<option key={`h2h-a-${abv}`} value={abv}>{abv}</option>))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Team B Abv</label>
                  <select
                    className="mt-1 block w-full border rounded px-2 py-1"
                    value={(function(){ try { const o=JSON.parse(formulaParamsText||'{}'); return o.teamAbvB||''; } catch { return ''; } })()}
                    onChange={(e)=>{ const v=e.target.value; try { console.log('[create-prop] H2H team B changed', { teamAbvB: v }); } catch {} try { const o = formulaParamsText && formulaParamsText.trim() ? JSON.parse(formulaParamsText) : {}; o.teamAbvB = v; setFormulaParamsText(JSON.stringify(o, null, 2)); } catch {} }}
                  >
                    <option value="">Select team…</option>
                    {teamOptionsH2H.map((abv) => (<option key={`h2h-b-${abv}`} value={abv}>{abv}</option>))}
                  </select>
                </div>
              </div>
            )}
            {autoGradeKey === 'team_multi_stat_ou' && (
              <div className="mt-3 space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Metrics (sum of 2+)</label>
                  <div className="mt-1 space-y-2">
                    {(selectedMetrics.length ? selectedMetrics : ['','']).map((value, idx) => (
                      <div key={`metric-row-team-${idx}`} className="flex items-center gap-2">
                        {metricLoading ? (
                          <div className="text-xs text-gray-600">Loading metrics…</div>
                        ) : metricOptions && metricOptions.length > 0 ? (
                          <select
                            className="block flex-1 border rounded px-2 py-1"
                            value={value || ''}
                            onChange={(e) => {
                              const v = e.target.value;
                              const arr = [...(selectedMetrics.length ? selectedMetrics : ['',''])];
                              arr[idx] = v;
                              const uniq = Array.from(new Set(arr.filter(Boolean)));
                              setSelectedMetrics(uniq);
                              upsertRootParam('metrics', uniq);
                            }}
                          >
                            <option value="">Select a metric…</option>
                            {metricOptions.map((k) => (<option key={`team-m-${idx}-${k}`} value={k}>{formatMetricLabel(k)}</option>))}
                          </select>
                        ) : (
                          <input
                            className="block flex-1 border rounded px-2 py-1"
                            value={value || ''}
                            onChange={(e) => {
                              const v = e.target.value;
                              const arr = [...(selectedMetrics.length ? selectedMetrics : ['',''])];
                              arr[idx] = v;
                              const uniq = Array.from(new Set(arr.filter(Boolean)));
                              setSelectedMetrics(uniq);
                              upsertRootParam('metrics', uniq);
                            }}
                            placeholder="e.g. rushingYards"
                          />
                        )}
                        <button
                          type="button"
                          className="px-2 py-1 text-xs bg-gray-200 rounded"
                          onClick={() => {
                            const arr = [...(selectedMetrics.length ? selectedMetrics : ['',''])];
                            if (arr.length <= 2) return;
                            arr.splice(idx, 1);
                            const uniq = Array.from(new Set(arr.filter(Boolean)));
                            setSelectedMetrics(uniq);
                            upsertRootParam('metrics', uniq);
                          }}
                          disabled={(selectedMetrics.length ? selectedMetrics.length : 2) <= 2}
                          title="Remove metric"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                    <div>
                      <button
                        type="button"
                        className="px-3 py-1 bg-gray-200 rounded"
                        onClick={() => {
                          const arr = [...(selectedMetrics.length ? selectedMetrics : ['',''])];
                          arr.push('');
                          setSelectedMetrics(arr);
                        }}
                      >
                        Add metric
                      </button>
                      <div className="text-xs text-gray-600 mt-1">Minimum 2 metrics.</div>
                    </div>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Team Abv</label>
                  <select
                    className="mt-1 block w-full border rounded px-2 py-1"
                    value={(function(){ try { const o=JSON.parse(formulaParamsText||'{}'); return o.teamAbv||''; } catch { return ''; } })()}
                    onChange={(e)=>{ try { const o = formulaParamsText && formulaParamsText.trim() ? JSON.parse(formulaParamsText) : {}; o.teamAbv = e.target.value; setFormulaParamsText(JSON.stringify(o, null, 2)); } catch {} }}
                  >
                    <option value="">Select team…</option>
                    {teamOptionsH2H.map((abv) => (<option key={`tm-ou-${abv}`} value={abv}>{abv}</option>))}
                  </select>
                </div>
                <div className="border rounded p-3 bg-gray-50">
                  <div className="text-sm font-medium text-gray-700 mb-2">Per-side grading rule</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <div className="text-sm font-semibold mb-1">Side A</div>
                      <div className="flex items-center gap-2">
                        <select value={sideAComparator} onChange={(e) => { const v = e.target.value; setSideAComparator(v); upsertSidesInParams({ A: { comparator: v, threshold: Number(sideAThreshold) || 0 } }); }} className="border rounded px-2 py-1">
                          <option value="gte">Equal or more than</option>
                          <option value="lte">Equal or less than</option>
                        </select>
                        <input type="number" value={sideAThreshold} onChange={(e) => { const v = e.target.value; setSideAThreshold(v); upsertSidesInParams({ A: { comparator: sideAComparator, threshold: Number(v) || 0 } }); }} placeholder="e.g. 300" className="border rounded px-2 py-1 w-24" />
                      </div>
                    </div>
                    <div>
                      <div className="text-sm font-semibold mb-1">Side B</div>
                      <div className="flex items-center gap-2">
                        <select value={sideBComparator} onChange={(e) => { const v = e.target.value; setSideBComparator(v); upsertSidesInParams({ B: { comparator: v, threshold: Number(sideBThreshold) || 0 } }); }} className="border rounded px-2 py-1">
                          <option value="gte">Equal or more than</option>
                          <option value="lte">Equal or less than</option>
                        </select>
                        <input type="number" value={sideBThreshold} onChange={(e) => { const v = e.target.value; setSideBThreshold(v); upsertSidesInParams({ B: { comparator: sideBComparator, threshold: Number(v) || 0 } }); }} placeholder="e.g. 299" className="border rounded px-2 py-1 w-24" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
            {autoGradeKey === 'team_multi_stat_h2h' && (
              <div className="mt-3 space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Metrics (sum of 2+)</label>
                  <div className="mt-1 space-y-2">
                    {(selectedMetrics.length ? selectedMetrics : ['','']).map((value, idx) => (
                      <div key={`metric-row-teamh2h-${idx}`} className="flex items-center gap-2">
                        {metricLoading ? (
                          <div className="text-xs text-gray-600">Loading metrics…</div>
                        ) : metricOptions && metricOptions.length > 0 ? (
                          <select
                            className="block flex-1 border rounded px-2 py-1"
                            value={value || ''}
                            onChange={(e) => {
                              const v = e.target.value;
                              const arr = [...(selectedMetrics.length ? selectedMetrics : ['',''])];
                              arr[idx] = v;
                              const uniq = Array.from(new Set(arr.filter(Boolean)));
                              setSelectedMetrics(uniq);
                              upsertRootParam('metrics', uniq);
                            }}
                          >
                            <option value="">Select a metric…</option>
                            {metricOptions.map((k) => (<option key={`teamh2h-m-${idx}-${k}`} value={k}>{formatMetricLabel(k)}</option>))}
                          </select>
                        ) : (
                          <input
                            className="block flex-1 border rounded px-2 py-1"
                            value={value || ''}
                            onChange={(e) => {
                              const v = e.target.value;
                              const arr = [...(selectedMetrics.length ? selectedMetrics : ['',''])];
                              arr[idx] = v;
                              const uniq = Array.from(new Set(arr.filter(Boolean)));
                              setSelectedMetrics(uniq);
                              upsertRootParam('metrics', uniq);
                            }}
                            placeholder="e.g. rushingYards"
                          />
                        )}
                        <button
                          type="button"
                          className="px-2 py-1 text-xs bg-gray-200 rounded"
                          onClick={() => {
                            const arr = [...(selectedMetrics.length ? selectedMetrics : ['',''])];
                            if (arr.length <= 2) return;
                            arr.splice(idx, 1);
                            const uniq = Array.from(new Set(arr.filter(Boolean)));
                            setSelectedMetrics(uniq);
                            upsertRootParam('metrics', uniq);
                          }}
                          disabled={(selectedMetrics.length ? selectedMetrics.length : 2) <= 2}
                          title="Remove metric"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                    <div>
                      <button
                        type="button"
                        className="px-3 py-1 bg-gray-200 rounded"
                        onClick={() => {
                          const arr = [...(selectedMetrics.length ? selectedMetrics : ['',''])];
                          arr.push('');
                          setSelectedMetrics(arr);
                        }}
                      >
                        Add metric
                      </button>
                      <div className="text-xs text-gray-600 mt-1">Minimum 2 metrics.</div>
                    </div>
                  </div>
                </div>
              </div>
            )}
            {autoGradeKey === 'player_multi_stat_ou' && (
              <div className="mt-3 space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Metrics (sum of 2+)</label>
                  <div className="mt-1 space-y-2">
                    {(selectedMetrics.length ? selectedMetrics : ['','']).map((value, idx) => (
                      <div key={`metric-row-${idx}`} className="flex items-center gap-2">
                        {metricLoading ? (
                          <div className="text-xs text-gray-600">Loading metrics…</div>
                        ) : metricOptions && metricOptions.length > 0 ? (
                          <select
                            className="block flex-1 border rounded px-2 py-1"
                            value={value || ''}
                            onChange={(e) => {
                              const v = e.target.value;
                              const arr = [...(selectedMetrics.length ? selectedMetrics : ['',''])];
                              arr[idx] = v;
                              const uniq = Array.from(new Set(arr.filter(Boolean)));
                              setSelectedMetrics(uniq);
                              upsertRootParam('metrics', uniq);
                            }}
                          >
                            <option value="">Select a metric…</option>
                            {metricOptions.map((k) => (<option key={`m-${idx}-${k}`} value={k}>{formatMetricLabel(k)}</option>))}
                          </select>
                        ) : (
                          <input
                            className="block flex-1 border rounded px-2 py-1"
                            value={value || ''}
                            onChange={(e) => {
                              const v = e.target.value;
                              const arr = [...(selectedMetrics.length ? selectedMetrics : ['',''])];
                              arr[idx] = v;
                              const uniq = Array.from(new Set(arr.filter(Boolean)));
                              setSelectedMetrics(uniq);
                              upsertRootParam('metrics', uniq);
                            }}
                            placeholder="e.g. passingYards"
                          />
                        )}
                        <button
                          type="button"
                          className="px-2 py-1 text-xs bg-gray-200 rounded"
                          onClick={() => {
                            const arr = [...(selectedMetrics.length ? selectedMetrics : ['',''])];
                            if (arr.length <= 2) return;
                            arr.splice(idx, 1);
                            const uniq = Array.from(new Set(arr.filter(Boolean)));
                            setSelectedMetrics(uniq);
                            upsertRootParam('metrics', uniq);
                          }}
                          disabled={(selectedMetrics.length ? selectedMetrics.length : 2) <= 2}
                          title="Remove metric"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                    <div>
                      <button
                        type="button"
                        className="px-3 py-1 bg-gray-200 rounded"
                        onClick={() => {
                          const arr = [...(selectedMetrics.length ? selectedMetrics : ['',''])];
                          arr.push('');
                          setSelectedMetrics(arr);
                        }}
                      >
                        Add metric
                      </button>
                      <div className="text-xs text-gray-600 mt-1">Minimum 2 metrics.</div>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Team</label>
                    <select className="mt-1 block w-full border rounded px-2 py-1" value={teamAbvA} onChange={(e) => setTeamAbvA(e.target.value)}>
                      <option value="">Select team…</option>
                      {teamOptionsH2H.map((abv) => (<option key={`multi-${abv}`} value={abv}>{abv}</option>))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Player</label>
                    <select
                      className="mt-1 block w-full border rounded px-2 py-1"
                      value={formulaPlayerId}
                      onChange={(e) => { setFormulaPlayerId(e.target.value); upsertRootParam('playerId', e.target.value); upsertRootParam('entity', 'player'); }}
                      disabled={!teamAbvA}
                    >
                      <option value="">Select player…</option>
                      {playersA.map(([id, p]) => (
                        <option key={`multi-player-${id}`} value={id}>{p?.longName || id}</option>
                      ))}
                    </select>
                  </div>
                </div>
                {false && <div />}
                <div className="border rounded p-3 bg-gray-50">
                  <div className="text-sm font-medium text-gray-700 mb-2">Per-side grading rule</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <div className="text-sm font-semibold mb-1">Side A</div>
                      <div className="flex items-center gap-2">
                        <select value={sideAComparator} onChange={(e) => { const v = e.target.value; setSideAComparator(v); upsertSidesInParams({ A: { comparator: v, threshold: Number(sideAThreshold) || 0 } }); }} className="border rounded px-2 py-1">
                          <option value="gte">Equal or more than</option>
                          <option value="lte">Equal or less than</option>
                        </select>
                        <input type="number" value={sideAThreshold} onChange={(e) => { const v = e.target.value; setSideAThreshold(v); upsertSidesInParams({ A: { comparator: sideAComparator, threshold: Number(v) || 0 } }); }} placeholder="e.g. 300" className="border rounded px-2 py-1 w-24" />
                      </div>
                    </div>
                    <div>
                      <div className="text-sm font-semibold mb-1">Side B</div>
                      <div className="flex items-center gap-2">
                        <select value={sideBComparator} onChange={(e) => { const v = e.target.value; setSideBComparator(v); upsertSidesInParams({ B: { comparator: v, threshold: Number(sideBThreshold) || 0 } }); }} className="border rounded px-2 py-1">
                          <option value="gte">Equal or more than</option>
                          <option value="lte">Equal or less than</option>
                        </select>
                        <input type="number" value={sideBThreshold} onChange={(e) => { const v = e.target.value; setSideBThreshold(v); upsertSidesInParams({ B: { comparator: sideBComparator, threshold: Number(v) || 0 } }); }} placeholder="e.g. 299" className="border rounded px-2 py-1 w-24" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
            {autoGradeKey === 'player_h2h' && (
              <div className="mt-3 space-y-3">
                {/* Metric selection remains visible above via the same block; ensure entity=player */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Metric</label>
                    {metricLoading ? (
                      <div className="mt-1 text-xs text-gray-600">Loading metrics…</div>
                    ) : (
                      <select
                        className="mt-1 block w-full border rounded px-2 py-1"
                        value={selectedMetric}
                        onChange={(e)=> { setSelectedMetric(e.target.value); upsertRootParam('metric', e.target.value); upsertRootParam('entity', 'player'); }}
                        disabled={!metricOptions || metricOptions.length === 0}
                      >
                        <option value="">{metricOptions && metricOptions.length > 0 ? 'Select a metric…' : 'No metrics available'}</option>
                        {(metricOptions || []).map((k) => (<option key={k} value={k}>{formatMetricLabel(k)}</option>))}
                      </select>
                    )}
                    {!!metricError && <div className="mt-1 text-xs text-red-600">{metricError}</div>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Winner Rule</label>
                    <select
                      className="mt-1 block w-full border rounded px-2 py-1"
                      value={winnerRule}
                      onChange={(e) => { setWinnerRule(e.target.value); upsertRootParam('winnerRule', e.target.value); }}
                    >
                      <option value="higher">Higher wins</option>
                      <option value="lower">Lower wins</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="border rounded p-3 bg-gray-50">
                    <div className="text-sm font-semibold mb-2">Side A</div>
                    <label className="block text-sm">Team</label>
                    <select className="mt-1 block w-full border rounded px-2 py-1" value={teamAbvA} onChange={(e) => setTeamAbvA(e.target.value)}>
                      <option value="">Select team…</option>
                      {teamOptionsH2H.map((abv) => (<option key={`A-${abv}`} value={abv}>{abv}</option>))}
                    </select>
                    <label className="block text-sm mt-2">Player</label>
                    <select className="mt-1 block w-full border rounded px-2 py-1" value={playerAId} onChange={(e) => { setPlayerAId(e.target.value); upsertRootParam('playerAId', e.target.value); upsertRootParam('entity', 'player'); }} disabled={!teamAbvA}>
                      <option value="">Select player…</option>
                      {playersA.map(([id, p]) => (
                        <option key={`A-${id}`} value={id}>{p?.longName || id}</option>
                      ))}
                    </select>
                  </div>
                  <div className="border rounded p-3 bg-gray-50">
                    <div className="text-sm font-semibold mb-2">Side B</div>
                    <label className="block text-sm">Team</label>
                    <select className="mt-1 block w-full border rounded px-2 py-1" value={teamAbvB} onChange={(e) => setTeamAbvB(e.target.value)}>
                      <option value="">Select team…</option>
                      {teamOptionsH2H.map((abv) => (<option key={`B-${abv}`} value={abv}>{abv}</option>))}
                    </select>
                    <label className="block text-sm mt-2">Player</label>
                    <select className="mt-1 block w-full border rounded px-2 py-1" value={playerBId} onChange={(e) => { setPlayerBId(e.target.value); upsertRootParam('playerBId', e.target.value); upsertRootParam('entity', 'player'); }} disabled={!teamAbvB}>
                      <option value="">Select player…</option>
                      {playersB.map(([id, p]) => (
                        <option key={`B-${id}`} value={id}>{p?.longName || id}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            )}
            {autoGradeKey === 'player_multi_stat_h2h' && (
              <div className="mt-3 space-y-3">
                {/* Metrics multi-select (minimum 2) */}
                <div>
                  <label className="block text-sm font-medium text-gray-700">Metrics</label>
                  {metricLoading ? (
                    <div className="mt-1 text-xs text-gray-600">Loading metrics…</div>
                  ) : (
                    <div className="space-y-2 mt-1">
                      {(selectedMetrics.length ? selectedMetrics : ['', '']).map((m, idx) => (
                        <div key={`pmsh2h-metric-${idx}`} className="flex items-center gap-2">
                          {metricOptions && metricOptions.length > 0 ? (
                            <select
                              className="border rounded px-2 py-1 flex-1"
                              value={m}
                              onChange={(e) => {
                                const val = e.target.value;
                                const next = [...(selectedMetrics.length ? selectedMetrics : ['', ''])];
                                next[idx] = val;
                                const uniq = Array.from(new Set(next.filter(Boolean)));
                                setSelectedMetrics(next);
                                upsertRootParam('metrics', uniq);
                                upsertRootParam('entity', 'player');
                              }}
                            >
                              <option value="">Select metric…</option>
                              {metricOptions.map((k) => (
                                <option key={`pmsh2h-opt-${k}`} value={k}>{formatMetricLabel(k)}</option>
                              ))}
                            </select>
                          ) : (
                            <input
                              className="border rounded px-2 py-1 flex-1"
                              value={m}
                              onChange={(e) => {
                                const val = e.target.value;
                                const next = [...(selectedMetrics.length ? selectedMetrics : ['', ''])];
                                next[idx] = val;
                                setSelectedMetrics(next);
                                const uniq = Array.from(new Set(next.filter(Boolean)));
                                upsertRootParam('metrics', uniq);
                                upsertRootParam('entity', 'player');
                              }}
                              placeholder="e.g. passingYards"
                            />
                          )}
                          <button
                            type="button"
                            className="px-3 py-1 bg-gray-200 rounded"
                            onClick={() => {
                              const next = [...(selectedMetrics.length ? selectedMetrics : ['', ''])];
                              next.splice(idx, 1);
                              setSelectedMetrics(next);
                              const uniq = Array.from(new Set(next.filter(Boolean)));
                              upsertRootParam('metrics', uniq);
                            }}
                            disabled={(selectedMetrics.length ? selectedMetrics.length : 2) <= 2}
                            title="Remove metric"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                      <div>
                        <button
                          type="button"
                          className="px-3 py-1 bg-gray-200 rounded"
                          onClick={() => {
                            const arr = [...(selectedMetrics.length ? selectedMetrics : ['', ''])];
                            arr.push('');
                            setSelectedMetrics(arr);
                          }}
                        >
                          Add metric
                        </button>
                        <div className="text-xs text-gray-600 mt-1">Minimum 2 metrics.</div>
                      </div>
                    </div>
                  )}
                </div>
                {/* Winner rule */}
                <div>
                  <label className="block text-sm font-medium text-gray-700">Winner Rule</label>
                  <select
                    className="mt-1 block w-full border rounded px-2 py-1"
                    value={winnerRule}
                    onChange={(e) => { setWinnerRule(e.target.value); upsertRootParam('winnerRule', e.target.value); }}
                  >
                    <option value="higher">Higher wins</option>
                    <option value="lower">Lower wins</option>
                  </select>
                </div>
                {/* Players A/B */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="border rounded p-3 bg-gray-50">
                    <div className="text-sm font-semibold mb-2">Side A</div>
                    <label className="block text-sm">Team</label>
                    <select className="mt-1 block w-full border rounded px-2 py-1" value={teamAbvA} onChange={(e) => setTeamAbvA(e.target.value)}>
                      <option value="">Select team…</option>
                      {teamOptionsH2H.map((abv) => (<option key={`pmsh2h-A-${abv}`} value={abv}>{abv}</option>))}
                    </select>
                    <label className="block text-sm mt-2">Player</label>
                    <select className="mt-1 block w-full border rounded px-2 py-1" value={playerAId} onChange={(e) => { setPlayerAId(e.target.value); upsertRootParam('playerAId', e.target.value); upsertRootParam('entity', 'player'); }} disabled={!teamAbvA}>
                      <option value="">Select player…</option>
                      {playersA.map(([id, p]) => (
                        <option key={`pmsh2h-A-${id}`} value={id}>{p?.longName || id}</option>
                      ))}
                    </select>
                  </div>
                  <div className="border rounded p-3 bg-gray-50">
                    <div className="text-sm font-semibold mb-2">Side B</div>
                    <label className="block text-sm">Team</label>
                    <select className="mt-1 block w-full border rounded px-2 py-1" value={teamAbvB} onChange={(e) => setTeamAbvB(e.target.value)}>
                      <option value="">Select team…</option>
                      {teamOptionsH2H.map((abv) => (<option key={`pmsh2h-B-${abv}`} value={abv}>{abv}</option>))}
                    </select>
                    <label className="block text-sm mt-2">Player</label>
                    <select className="mt-1 block w-full border rounded px-2 py-1" value={playerBId} onChange={(e) => { setPlayerBId(e.target.value); upsertRootParam('playerBId', e.target.value); upsertRootParam('entity', 'player'); }} disabled={!teamAbvB}>
                      <option value="">Select player…</option>
                      {playersB.map(([id, p]) => (
                        <option key={`pmsh2h-B-${id}`} value={id}>{p?.longName || id}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            )}
            {/* Sample Readout */}
            <div className="mt-4 border rounded p-3 bg-gray-50">
              <div className="text-sm font-semibold mb-2">Sample Readout</div>
              {!event?.espnGameID && String(dataSource) === 'nfl' && (
                <div className="text-xs text-gray-600">Link an event with an ESPN game ID to see a preview.</div>
              )}
              {event?.espnGameID && previewLoading && (
                <div className="text-xs text-gray-600">Loading preview…</div>
              )}
              {!!previewError && (
                <div className="text-xs text-red-600">{previewError}</div>
              )}
              {!previewLoading && !previewError && previewData && (
                <div className="text-xs text-gray-800 space-y-2">
                  <div>Source: <span className="font-mono">{previewData.source}</span></div>
                  {/* API Endpoints used for this preview */}
                  {(previewData?.endpoints?.boxscoreUrl || previewData?.endpoints?.statusUrl || previewData?.endpoints?.espnScoreboardUrl) && (
                    <div className="space-y-1">
                      <div className="font-medium">Endpoints used (copy to verify)</div>
                      {previewData?.endpoints?.boxscoreUrl && (
                        <div className="break-all"><span className="text-gray-600">Boxscore:</span> <span className="font-mono">{previewData.endpoints.boxscoreUrl}</span></div>
                      )}
                      {previewData?.endpoints?.statusUrl && (
                        <div className="break-all"><span className="text-gray-600">Status:</span> <span className="font-mono">{previewData.endpoints.statusUrl}</span></div>
                      )}
                      {previewData?.endpoints?.espnScoreboardUrl && (
                        <div className="break-all"><span className="text-gray-600">ESPN Scoreboard:</span> <span className="font-mono">{previewData.endpoints.espnScoreboardUrl}</span></div>
                      )}
                    </div>
                  )}
                  {previewData.scoreboard && (
                    <div>
                      <div className="font-medium">Scoreboard</div>
                      <div>
                        {(function(){
                          try {
                            const g = previewData.scoreboard;
                            const away = g.away || g.awayTeam;
                            const home = g.home || g.homeTeam;
                            const awayR = g?.lineScore?.away?.R ?? '';
                            const homeR = g?.lineScore?.home?.R ?? '';
                            const status = g.currentInning || g.gameStatus || '';
                            return `${away} @ ${home} — ${awayR} - ${homeR} ${status ? '('+status+')' : ''}`;
                          } catch { return null; }
                        })()}
                      </div>
                    </div>
                  )}
                  {autoGradeKey === 'who_wins' && (
                    <div>
                      <div className="font-medium">Final Score</div>
                      {String(previewData?.source || '').toLowerCase() === 'nfl' ? (
                        <div>Home: {previewData?.weekly?.homePts ?? '–'} | Away: {previewData?.weekly?.awayPts ?? '–'}</div>
                      ) : (
                        <div>Home R: {previewData?.lineScore?.home?.R ?? '–'} | Away R: {previewData?.lineScore?.away?.R ?? '–'}</div>
                      )}
                    </div>
                  )}
                  <div>
                    <div className="font-medium">Boxscore (normalized)</div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      <div>
                        <div className="text-gray-600">Players</div>
                        <div>{Object.keys(previewData.normalized?.playersById || {}).length}</div>
                      </div>
                      <div>
                        <div className="text-gray-600">Stat Keys (sample)</div>
                        <div className="truncate">
                          {(previewData.normalized?.statKeys || []).slice(0, 8).join(', ') || '—'}
                          {(previewData.normalized?.statKeys || []).length > 8 ? '…' : ''}
                        </div>
                      </div>
                    </div>
                  </div>
                  {/* Auto-grade preview reflecting current selections */}
                  {autoGradeKey && (
                    <div className="mt-2 p-2 bg-white rounded border">
                      <div className="font-medium mb-1">Auto-grade Preview</div>
                      <div className="space-y-1">
                        {(() => {
                          try {
                            const norm = previewData?.normalized || {};
                            const players = norm.playersById || {};
                            const getName = (id) => (players?.[id]?.longName || id);
                            const getStat = (id, metric) => {
                              try {
                                const stats = players?.[id]?.stats || {};
                                let v = stats?.[metric];
                                if (v == null && typeof metric === 'string') {
                                  v = stats?.[metric.toUpperCase()] ?? stats?.[metric.toLowerCase()];
                                }
                                const n = Number(v);
                                return Number.isFinite(n) ? n : null;
                              } catch { return null; }
                            };
                            const sumTeam = (abv, metric) => {
                              const normalize = (v) => {
                                try { return (typeof normalizeAbv === 'function') ? normalizeAbv(v) : String(v || '').toUpperCase(); } catch { return String(v || '').toUpperCase(); }
                              };
                              const target = normalize(abv);
                              let total = 0;
                              for (const p of Object.values(players)) {
                                const team = normalize(p?.teamAbv || '');
                                if (team !== target) continue;
                                let v = p?.stats?.[metric];
                                if (v == null && typeof metric === 'string') {
                                  v = p?.stats?.[metric.toUpperCase()] ?? p?.stats?.[metric.toLowerCase()];
                                }
                                v = Number(v);
                                if (Number.isFinite(v)) total += v;
                              }
                              return total;
                            };
                            const lines = [];
                            if (autoGradeKey === 'stat_over_under') {
                              if (formulaPlayerId && selectedMetric) {
                                const v = getStat(formulaPlayerId, selectedMetric);
                                lines.push(`Player ${getName(formulaPlayerId)} ${selectedMetric} = ${v == null ? '—' : v}`);
                              } else {
                                lines.push('Select a player and metric to preview.');
                              }
                            } else if (autoGradeKey === 'player_h2h') {
                              if (playerAId && playerBId && selectedMetric) {
                                const a = getStat(playerAId, selectedMetric);
                                const b = getStat(playerBId, selectedMetric);
                                lines.push(`A: ${getName(playerAId)} ${selectedMetric} = ${a == null ? '—' : a}`);
                                lines.push(`B: ${getName(playerBId)} ${selectedMetric} = ${b == null ? '—' : b}`);
                              } else {
                                lines.push('Select both players and a metric to preview.');
                              }
                            } else if (autoGradeKey === 'player_multi_stat_ou') {
                              const list = Array.isArray(selectedMetrics) ? selectedMetrics.filter(Boolean) : [];
                              if (formulaPlayerId && list.length >= 2) {
                                const vals = list.map((m) => getStat(formulaPlayerId, m)).map(v => (v==null?0:v));
                                const sum = vals.reduce((a,b)=>a+b,0);
                                lines.push(`Player ${getName(formulaPlayerId)} sum(${list.join('+')}) = ${sum}`);
                              } else {
                                lines.push('Pick a player and at least 2 metrics to preview.');
                              }
                            } else if (autoGradeKey === 'player_multi_stat_h2h') {
                              const list = Array.isArray(selectedMetrics) ? selectedMetrics.filter(Boolean) : [];
                              if (playerAId && playerBId && list.length >= 2) {
                                const sumFor = (pid) => list.map((m)=>getStat(pid,m)).map(v=> (v==null?0:v)).reduce((a,b)=>a+b,0);
                                const a = sumFor(playerAId); const b = sumFor(playerBId);
                                lines.push(`A: ${getName(playerAId)} sum(${list.join('+')}) = ${a}`);
                                lines.push(`B: ${getName(playerBId)} sum(${list.join('+')}) = ${b}`);
                              } else {
                                lines.push('Pick both players and at least 2 metrics to preview.');
                              }
                            } else if (autoGradeKey === 'team_stat_over_under') {
                              try {
                                const o = formulaParamsText && formulaParamsText.trim() ? JSON.parse(formulaParamsText) : {};
                                const abv = o.teamAbv || '';
                                const metric = selectedMetric || o.metric || '';
                                if (abv && metric) {
                                  const src = String(previewData?.source || '').toLowerCase();
                                  if (src === 'nfl') {
                                    const teams = Array.isArray(previewData?.rawTeams) ? previewData.rawTeams : [];
                                    const findVal = () => {
                                      const t = teams.find(ti => String(ti?.team?.abbreviation || '').toUpperCase() === String(abv).toUpperCase());
                                      if (!t) return undefined;
                                      const stat = (Array.isArray(t.statistics) ? t.statistics : []).find(s => String(s?.name || '').toLowerCase() === String(metric).toLowerCase());
                                      if (!stat) return undefined;
                                      const v = Number(stat.value);
                                      if (Number.isFinite(v)) return v;
                                      const dv = String(stat.displayValue || '').trim();
                                      const n = parseFloat(dv);
                                      return Number.isFinite(n) ? n : undefined;
                                    };
                                    let v = findVal();
                                    // ESPN truth for points
                                    if (!Number.isFinite(v) && String(metric).toLowerCase() === 'points') {
                                      try {
                                        const wkGames = previewData?.espnWeekly ? (previewData.espnWeekly.events || []) : [];
                                        const g = (() => {
                                          try { return wkGames.find(ev => String(ev?.id || '').trim() === String(event?.espnGameID || '').trim()); } catch { return null; }
                                        })();
                                        if (g) {
                                          const comps = Array.isArray(g?.competitions) ? g.competitions : [];
                                          const comp = comps[0] || {};
                                          const compsArr = Array.isArray(comp?.competitors) ? comp.competitors : [];
                                          const findPts = (sideAbv) => {
                                            const c = compsArr.find(ci => String(ci?.team?.abbreviation || '').toUpperCase() === String(sideAbv).toUpperCase());
                                            const num = Number(c?.score);
                                            return Number.isFinite(num) ? num : undefined;
                                          };
                                          v = findPts(abv);
                                        }
                                      } catch {}
                                    }
                                    lines.push(`Team ${abv} ${metric} (NFL team stat) = ${v == null ? '—' : v}`);
                                  } else {
                                    // Prefer scoreboard R/H/E if available and MLB
                                    const mLc = String(metric).toUpperCase();
                                    const sb = previewData?.scoreboard;
                                    if (sb && (mLc === 'R' || mLc === 'H' || mLc === 'E')) {
                                      const away = String(sb.away || ''); const home = String(sb.home || '');
                                      const side = (String(abv).toUpperCase() === String(away).toUpperCase()) ? 'away' : 'home';
                                      const v = Number(sb?.lineScore?.[side]?.[mLc]);
                                      lines.push(`Team ${abv} ${mLc} (scoreboard) = ${Number.isFinite(v) ? v : '—'}`);
                                    } else {
                                      const total = sumTeam(abv, metric);
                                      lines.push(`Team ${abv} ${metric} (boxscore sum) = ${Number.isFinite(total) ? total : '—'}`);
                                    }
                                  }
                                } else {
                                  lines.push('Select team and metric to preview.');
                                }
                              } catch { lines.push('Select team and metric to preview.'); }
                            } else if (autoGradeKey === 'team_stat_h2h') {
                              try {
                                const o = formulaParamsText && formulaParamsText.trim() ? JSON.parse(formulaParamsText) : {};
                                const a = o.teamAbvA || ''; const b = o.teamAbvB || '';
                                const metric = selectedMetric || o.metric || '';
                                if (a && b && metric) {
                                  const src = String(previewData?.source || '').toLowerCase();
                                  if (src === 'nfl') {
                                    const teams = Array.isArray(previewData?.rawTeams) ? previewData.rawTeams : [];
                                    const findVal = (abv) => {
                                      const t = teams.find(ti => String(ti?.team?.abbreviation || '').toUpperCase() === String(abv).toUpperCase());
                                      if (!t) return undefined;
                                      const stat = (Array.isArray(t.statistics) ? t.statistics : []).find(s => String(s?.name || '').toLowerCase() === String(metric).toLowerCase());
                                      if (!stat) return undefined;
                                      const v = Number(stat.value);
                                      if (Number.isFinite(v)) return v;
                                      const dv = String(stat.displayValue || '').trim();
                                      const n = parseFloat(dv);
                                      return Number.isFinite(n) ? n : undefined;
                                    };
                                    let va = findVal(a); let vb = findVal(b);
                                    if (String(metric).toLowerCase() === 'points') {
                                      try {
                                        const wkGames = previewData?.espnWeekly ? (previewData.espnWeekly.events || []) : [];
                                        const g = (() => {
                                          try { return wkGames.find(ev => String(ev?.id || '').trim() === String(event?.espnGameID || '').trim()); } catch { return null; }
                                        })();
                                        if (g) {
                                          const comps = Array.isArray(g?.competitions) ? g.competitions : [];
                                          const comp = comps[0] || {};
                                          const compsArr = Array.isArray(comp?.competitors) ? comp.competitors : [];
                                          const findPts = (sideAbv) => {
                                            const c = compsArr.find(ci => String(ci?.team?.abbreviation || '').toUpperCase() === String(sideAbv).toUpperCase());
                                            const num = Number(c?.score);
                                            return Number.isFinite(num) ? num : undefined;
                                          };
                                          if (!Number.isFinite(va)) va = findPts(a);
                                          if (!Number.isFinite(vb)) vb = findPts(b);
                                        }
                                      } catch {}
                                    }
                                    lines.push(`A: ${a} ${metric} (NFL team stat) = ${va == null ? '—' : va}`);
                                    lines.push(`B: ${b} ${metric} (NFL team stat) = ${vb == null ? '—' : vb}`);
                                  } else {
                                    const mLc = String(metric).toUpperCase();
                                    const sb = previewData?.scoreboard;
                                    if (sb && (mLc === 'R' || mLc === 'H' || mLc === 'E')) {
                                      const away = String(sb.away || ''); const home = String(sb.home || '');
                                      const sideOf = (abv) => (String(abv).toUpperCase() === String(away).toUpperCase()) ? 'away' : 'home';
                                      const va = Number(sb?.lineScore?.[sideOf(a)]?.[mLc]);
                                      const vb = Number(sb?.lineScore?.[sideOf(b)]?.[mLc]);
                                      lines.push(`A: ${a} ${mLc} (scoreboard) = ${Number.isFinite(va)?va:'—'}`);
                                      lines.push(`B: ${b} ${mLc} (scoreboard) = ${Number.isFinite(vb)?vb:'—'}`);
                                    } else {
                                      const ta = sumTeam(a, metric); const tb = sumTeam(b, metric);
                                      lines.push(`A: ${a} ${metric} = ${Number.isFinite(ta)?ta:'—'}`);
                                      lines.push(`B: ${b} ${metric} = ${Number.isFinite(tb)?tb:'—'}`);
                                    }
                                  }
                                } else {
                                  lines.push('Select both teams and a metric to preview.');
                                }
                              } catch { lines.push('Select both teams and a metric to preview.'); }
                            } else if (autoGradeKey === 'team_multi_stat_ou') {
                              try {
                                const o = formulaParamsText && formulaParamsText.trim() ? JSON.parse(formulaParamsText) : {};
                                const abv = o.teamAbv || '';
                                const list = Array.isArray(selectedMetrics) && selectedMetrics.length ? selectedMetrics : (Array.isArray(o.metrics)?o.metrics:[]);
                                if (abv && list.length >= 2) {
                                  const src = String(previewData?.source || '').toLowerCase();
                                  let total = 0;
                                  if (src === 'nfl') {
                                    const teams = Array.isArray(previewData?.rawTeams) ? previewData.rawTeams : [];
                                    const findTeamStat = (metric) => {
                                      const t = teams.find(ti => String(ti?.team?.abbreviation || '').toUpperCase() === String(abv).toUpperCase());
                                      if (!t) return undefined;
                                      const stats = Array.isArray(t.statistics) ? t.statistics : [];
                                      const mLc = String(metric).toLowerCase();
                                      const stat = stats.find(s => String(s?.name || '').toLowerCase() === mLc);
                                      if (!stat) {
                                        if (mLc === 'points') {
                                          try {
                                            const wkGames = previewData?.espnWeekly ? (previewData.espnWeekly.events || []) : [];
                                            const g = wkGames.find(ev => String(ev?.id || '').trim() === String(event?.espnGameID || '').trim());
                                            if (g) {
                                              const comp = (Array.isArray(g.competitions) ? g.competitions : [])[0] || {};
                                              const compsArr = Array.isArray(comp?.competitors) ? comp.competitors : [];
                                              const c = compsArr.find(ci => String(ci?.team?.abbreviation || '').toUpperCase() === String(abv).toUpperCase());
                                              const num = Number(c?.score);
                                              return Number.isFinite(num) ? num : undefined;
                                            }
                                          } catch {}
                                        }
                                        return undefined;
                                      }
                                      const v = Number(stat.value);
                                      if (Number.isFinite(v)) return v;
                                      const dv = String(stat.displayValue || '').trim();
                                      const n = parseFloat(dv);
                                      return Number.isFinite(n) ? n : undefined;
                                    };
                                    for (const m of list) {
                                      const v = findTeamStat(m);
                                      if (Number.isFinite(v)) total += Number(v);
                                    }
                                  } else {
                                    for (const p of Object.values(players)) {
                                      if (String(p?.teamAbv || '').toUpperCase() !== String(abv).toUpperCase()) continue;
                                      for (const m of list) { const v = Number(p?.stats?.[m]); if (Number.isFinite(v)) total += v; }
                                    }
                                  }
                                  lines.push(`Team ${abv} sum(${list.join('+')}) = ${total}`);
                                } else {
                                  lines.push('Select team and at least 2 metrics to preview.');
                                }
                              } catch { lines.push('Select team and at least 2 metrics to preview.'); }
                            } else if (autoGradeKey === 'team_multi_stat_h2h') {
                              try {
                                const o = formulaParamsText && formulaParamsText.trim() ? JSON.parse(formulaParamsText) : {};
                                const a = o.teamAbvA || ''; const b = o.teamAbvB || '';
                                const list = Array.isArray(selectedMetrics) && selectedMetrics.length ? selectedMetrics : (Array.isArray(o.metrics)?o.metrics:[]);
                                if (a && b && list.length >= 2) {
                                  const src = String(previewData?.source || '').toLowerCase();
                                  const sumFor = (abv) => {
                                    let total = 0;
                                    if (src === 'nfl') {
                                      const teams = Array.isArray(previewData?.rawTeams) ? previewData.rawTeams : [];
                                      const findTeamStat = (metric) => {
                                        const t = teams.find(ti => String(ti?.team?.abbreviation || '').toUpperCase() === String(abv).toUpperCase());
                                        if (!t) return undefined;
                                        const stats = Array.isArray(t.statistics) ? t.statistics : [];
                                        const mLc = String(metric).toLowerCase();
                                        const stat = stats.find(s => String(s?.name || '').toLowerCase() === mLc);
                                        if (!stat) {
                                          if (mLc === 'points') {
                                            try {
                                              const wkGames = previewData?.espnWeekly ? (previewData.espnWeekly.events || []) : [];
                                              const g = wkGames.find(ev => String(ev?.id || '').trim() === String(event?.espnGameID || '').trim());
                                              if (g) {
                                                const comp = (Array.isArray(g.competitions) ? g.competitions : [])[0] || {};
                                                const compsArr = Array.isArray(comp?.competitors) ? comp.competitors : [];
                                                const c = compsArr.find(ci => String(ci?.team?.abbreviation || '').toUpperCase() === String(abv).toUpperCase());
                                                const num = Number(c?.score);
                                                return Number.isFinite(num) ? num : undefined;
                                              }
                                            } catch {}
                                          }
                                          return undefined;
                                        }
                                        const v = Number(stat.value);
                                        if (Number.isFinite(v)) return v;
                                        const dv = String(stat.displayValue || '').trim();
                                        const n = parseFloat(dv);
                                        return Number.isFinite(n) ? n : undefined;
                                      };
                                      for (const m of list) {
                                        const v = findTeamStat(m);
                                        if (Number.isFinite(v)) total += Number(v);
                                      }
                                    } else {
                                      for (const p of Object.values(players)) {
                                        if (String(p?.teamAbv || '').toUpperCase() !== String(abv).toUpperCase()) continue;
                                        for (const m of list) { const v = Number(p?.stats?.[m]); if (Number.isFinite(v)) total += v; }
                                      }
                                    }
                                    return total;
                                  };
                                  const sa = sumFor(a); const sb = sumFor(b);
                                  lines.push(`A: ${a} sum(${list.join('+')}) = ${sa}`);
                                  lines.push(`B: ${b} sum(${list.join('+')}) = ${sb}`);
                                } else {
                                  lines.push('Select both teams and at least 2 metrics to preview.');
                                }
                              } catch { lines.push('Select both teams and at least 2 metrics to preview.'); }
                            }
                            return lines.map((t, i) => (<div key={`agp-${i}`}>{t}</div>));
                          } catch { return null; }
                        })()}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          {false && <div />}
        </>
      )}

      <h1 className="text-2xl font-bold mb-4">Create a Prop</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="propShort" className="block text-sm font-medium text-gray-700">Short Label</label>
          <input id="propShort" type="text" value={propShort} onChange={(e) => setPropShort(e.target.value)} className="mt-1 block w-full border rounded px-2 py-1" />
        </div>
        <div>
          <label htmlFor="propValueModel" className="block text-sm font-medium text-gray-700">Value Model</label>
          <select id="propValueModel" value={propValueModel} onChange={(e) => setPropValueModel(e.target.value)} className="mt-1 block w-full border rounded px-2 py-1">
            <option value="vegas">Vegas</option>
            <option value="popular">Popular</option>
          </select>
        </div>
        <div>
          <label htmlFor="propSummary" className="block text-sm font-medium text-gray-700">Summary</label>
          <textarea id="propSummary" value={propSummary} onChange={(e) => setPropSummary(e.target.value)} className="mt-1 block w-full border rounded px-2 py-1" />
          <div className="mt-2">
            <button
              type="button"
              className="px-3 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
              onClick={openAISummaryModal}
              disabled={!(event?.id || eventId)}
              title={!(event?.id || eventId) ? 'Link an event first' : ''}
            >
              Generate AI Content
            </button>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Open Time</label>
            <input type="datetime-local" className="mt-1 block w-full border rounded px-2 py-1" value={propOpenTime} onChange={(e)=> setPropOpenTime(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Close Time</label>
            <input type="datetime-local" className="mt-1 block w-full border rounded px-2 py-1" value={propCloseTime} onChange={(e)=> setPropCloseTime(e.target.value)} />
            {event?.eventTime && (
              <div className="mt-1">
                <button type="button" onClick={() => setPropCloseTime(formatDateTimeLocal(event.eventTime))} className="text-sm px-3 py-1 rounded bg-gray-200 text-gray-800 hover:bg-gray-300">When event starts</button>
              </div>
            )}
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <h3 className="font-semibold">Side A</h3>
            <label className="block text-sm">Label</label>
            <input className="mt-1 block w-full border rounded px-2 py-1" value={propSideAShort} onChange={(e)=> setPropSideAShort(e.target.value)} />
            <label className="block text-sm mt-2">Take</label>
            <input className="mt-1 block w-full border rounded px-2 py-1" value={propSideATake} onChange={(e)=> setPropSideATake(e.target.value)} />
            {propValueModel === 'vegas' && (
              <>
                <label className="block text-sm mt-2">Moneyline</label>
                <input type="number" className="mt-1 block w-full border rounded px-2 py-1" value={propSideAMoneyline} onChange={(e)=> setPropSideAMoneyline(e.target.value)} />
                {autoGradeKey === 'who_wins' && (
                  <div className="mt-1 flex items-center gap-2">
                    <button type="button" className="px-2 py-1 text-xs bg-gray-200 rounded disabled:opacity-50" onClick={() => fetchMoneylineForSide('A')} disabled={oddsLoadingSide === 'A'}>
                      {oddsLoadingSide === 'A' ? 'Fetching…' : 'Fetch'}
                    </button>
                    {!!oddsError && <span className="text-xs text-red-600">{oddsError}</span>}
                  </div>
                )}
                <label className="block text-sm mt-2">Value A</label>
                <input type="number" className="mt-1 block w-full border rounded px-2 py-1" value={computedValueA ?? ''} readOnly />
              </>
            )}
          </div>
          <div>
            <h3 className="font-semibold">Side B</h3>
            <label className="block text-sm">Label</label>
            <input className="mt-1 block w-full border rounded px-2 py-1" value={propSideBShort} onChange={(e)=> setPropSideBShort(e.target.value)} />
            <label className="block text-sm mt-2">Take</label>
            <input className="mt-1 block w-full border rounded px-2 py-1" value={propSideBTake} onChange={(e)=> setPropSideBTake(e.target.value)} />
            {propValueModel === 'vegas' && (
              <>
                <label className="block text-sm mt-2">Moneyline</label>
                <input type="number" className="mt-1 block w-full border rounded px-2 py-1" value={propSideBMoneyline} onChange={(e)=> setPropSideBMoneyline(e.target.value)} />
                {autoGradeKey === 'who_wins' && (
                  <div className="mt-1 flex items-center gap-2">
                    <button type="button" className="px-2 py-1 text-xs bg-gray-200 rounded disabled:opacity-50" onClick={() => fetchMoneylineForSide('B')} disabled={oddsLoadingSide === 'B'}>
                      {oddsLoadingSide === 'B' ? 'Fetching…' : 'Fetch'}
                    </button>
                    {!!oddsError && <span className="text-xs text-red-600">{oddsError}</span>}
                  </div>
                )}
                <label className="block text-sm mt-2">Value B</label>
                <input type="number" className="mt-1 block w-full border rounded px-2 py-1" value={computedValueB ?? ''} readOnly />
              </>
            )}
          </div>
        </div>
        {event && teamOptions.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-gray-700">Teams</label>
            <div className="mt-1 flex flex-wrap">
              {teamOptions.map(team => {
                const active = selectedTeams.includes(team.recordId);
                return (
                  <button
                    key={team.recordId}
                    type="button"
                    onClick={() => {
                      if (active) setSelectedTeams(prev => prev.filter(id => id !== team.recordId));
                      else setSelectedTeams(prev => [...prev, team.recordId]);
                    }}
                    className={`inline-flex items-center px-3 py-1 mr-2 mb-2 text-sm font-medium rounded-full focus:outline-none ${
                      active ? 'bg-blue-100 text-blue-800 border border-blue-300' : 'bg-gray-200 text-gray-500 border border-gray-300'
                    }`}
                  >
                    {team.teamName}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {error && <p className="text-red-600">{error}</p>}
        <div>
          <label htmlFor="propStatus" className="block text-sm font-medium text-gray-700">Status</label>
          <select
            id="propStatus"
            value={propStatus}
            onChange={(e) => setPropStatus(e.target.value)}
            className="mt-1 block w-full border rounded px-2 py-1"
          >
            <option value="open">Open</option>
            <option value="closed">Closed</option>
            <option value="draft">Draft</option>
            <option value="live">Live</option>
            <option value="coming soon">Coming Soon</option>
          </select>
        </div>
        <button type="submit" disabled={loading} className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50">{loading ? 'Creating…' : 'Create Prop'}</button>
      </form>
    </div>
  );
} 