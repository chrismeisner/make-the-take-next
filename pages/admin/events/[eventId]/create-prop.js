import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/router';
import { useModal } from '../../../../contexts/ModalContext';

export default function CreateEventPropPage() {
  const router = useRouter();
  const { eventId } = router.query;
  const { openModal } = useModal();
  const [propShort, setPropShort] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [generatingSummary, setGeneratingSummary] = useState(false);
  const [propValueModel, setPropValueModel] = useState('vegas');
  const [propSummary, setPropSummary] = useState('');
  const [propSideAShort, setPropSideAShort] = useState('');
  const [propSideATake, setPropSideATake] = useState('');
  const [propSideAMoneyline, setPropSideAMoneyline] = useState('');
  const [propSideBShort, setPropSideBShort] = useState('');
  const [propSideBTake, setPropSideBTake] = useState('');
  const [propSideBMoneyline, setPropSideBMoneyline] = useState('');
  const propType = 'moneyline';
  const [event, setEvent] = useState(null);
  const [coverFile, setCoverFile] = useState(null);
  const [coverPreview, setCoverPreview] = useState(null);
  const [propCoverSource, setPropCoverSource] = useState('event');
  const [teamCoverUrl, setTeamCoverUrl] = useState(null);
  const [teamOptions, setTeamOptions] = useState([]);
  const [selectedTeams, setSelectedTeams] = useState([]);
  // Tank linking removed

  // Auto grading state (minimal)
  const [gradingMode, setGradingMode] = useState('manual'); // 'manual' | 'auto'
  const [gradingType, setGradingType] = useState('individual'); // 'individual' | 'h2h'
  // Built-in formula definitions (MVP: hardcoded)
  const DEFAULT_FORMULAS = [
    {
      formulaKey: 'who_wins',
      displayName: 'Who Wins',
      description: 'Grades a moneyline/who-wins prop using Major MLB scoreboard (final winner).',
      dataSource: 'major-mlb',
      defaultParams: { gradingType: 'team', metric: 'winner' },
    },
    {
      formulaKey: 'team_stat_over_under',
      displayName: 'Team Single Stat O/U',
      description: 'Grades a single team stat against A/B thresholds (>= or <=).',
      dataSource: 'major-mlb',
      defaultParams: {
        gradingType: 'team_stat_ou',
        entity: 'team',
        metric: 'R',
        sides: {
          A: { comparator: 'gte', threshold: 1 },
          B: { comparator: 'lte', threshold: 0 },
        },
      },
    },
    {
      formulaKey: 'stat_over_under',
      displayName: 'Player Single Stat O/U',
      description: 'Grades by comparing a single MLB stat to A/B thresholds (>= or <=).',
      dataSource: 'major-mlb',
      defaultParams: {
        gradingType: 'stat_ou',
        entity: 'player',
        metric: 'SO',
        sides: {
          A: { comparator: 'gte', threshold: 6 },
          B: { comparator: 'lte', threshold: 5 },
        },
      },
    },
    {
      formulaKey: 'player_h2h',
      displayName: 'Player H2H',
      description: 'Head-to-head players with per-side comparator and threshold on a single stat.',
      dataSource: 'major-mlb',
      defaultParams: {
        gradingType: 'player_h2h',
        entity: 'player',
        metric: 'SO',
        winnerRule: 'higher',
        sides: {
          A: { comparator: 'gte', threshold: 6 },
          B: { comparator: 'lte', threshold: 5 },
        },
      },
    },
    {
      formulaKey: 'player_multi_stat_ou',
      displayName: 'Player Multi Stat O/U',
      description: 'Sum multiple MLB stats for a player, then compare to A/B thresholds.',
      dataSource: 'major-mlb',
      defaultParams: {
        gradingType: 'player_multi_stat_ou',
        entity: 'player',
        metrics: [],
        sides: {
          A: { comparator: 'gte', threshold: 6 },
          B: { comparator: 'lte', threshold: 5 },
        },
      },
    },
    {
      formulaKey: 'team_stat_h2h',
      displayName: 'Team Stat H2H',
      description: 'Head-to-head teams comparing a single team stat to determine winner.',
      dataSource: 'major-mlb',
      defaultParams: {
        gradingType: 'team_h2h',
        entity: 'team',
        metric: 'R',
        winnerRule: 'higher',
      },
    },
  ];
  const [formulas, setFormulas] = useState(DEFAULT_FORMULAS);
  const [selectedFormulaKey, setSelectedFormulaKey] = useState('');
  const [formulaParamsText, setFormulaParamsText] = useState(''); // JSON string
  // Per-side variable controls for formula-driven grading (e.g., thresholds/comparators)
  const [sideAComparator, setSideAComparator] = useState('gte');
  const [sideAThreshold, setSideAThreshold] = useState('');
  const [sideBComparator, setSideBComparator] = useState('lte');
  const [sideBThreshold, setSideBThreshold] = useState('');
  // Minimal core params needed by strikeouts O/U formula
  const [formulaTeamAbv, setFormulaTeamAbv] = useState('');
  const [formulaPlayerId, setFormulaPlayerId] = useState('');
  // Individual mode selection (team aggregate vs player)
  const [individualMode, setIndividualMode] = useState('player'); // 'team' | 'player'
  // H2H-specific params
  const [h2hMode, setH2hMode] = useState('team'); // 'team' | 'player'
  const [playerAId, setPlayerAId] = useState('');
  const [playerBId, setPlayerBId] = useState('');
  const [compareRule, setCompareRule] = useState('most');
  const [tieRule, setTieRule] = useState('push');
  const [teamAbvA, setTeamAbvA] = useState('');
  const [teamAbvB, setTeamAbvB] = useState('');
  const [playersById, setPlayersById] = useState({});
  const [playersLoading, setPlayersLoading] = useState(false);
  const [playersError, setPlayersError] = useState('');
  const [autoGradeKey, setAutoGradeKey] = useState('');
  const [sideAMap, setSideAMap] = useState('');
  const [sideBMap, setSideBMap] = useState('');
  // Metrics for Stat O/U
  const [metricOptions, setMetricOptions] = useState([]);
  const [metricLoading, setMetricLoading] = useState(false);
  const [metricError, setMetricError] = useState('');
  // Multi metric selection state (for player_multi_stat_ou)
  const metricsSelected = useMemo(() => {
    try {
      const o = formulaParamsText && formulaParamsText.trim() ? JSON.parse(formulaParamsText) : {};
      return Array.isArray(o.metrics) ? o.metrics : [];
    } catch {
      return [];
    }
  }, [formulaParamsText]);
  const addMetric = (m) => {
    if (!m) return;
    try {
      const o = formulaParamsText && formulaParamsText.trim() ? JSON.parse(formulaParamsText) : {};
      const set = new Set(Array.isArray(o.metrics) ? o.metrics : []);
      set.add(m);
      o.metrics = Array.from(set);
      setFormulaParamsText(JSON.stringify(o, null, 2));
    } catch {}
  };
  const removeMetric = (m) => {
    try {
      const o = formulaParamsText && formulaParamsText.trim() ? JSON.parse(formulaParamsText) : {};
      o.metrics = (Array.isArray(o.metrics) ? o.metrics : []).filter((x) => x !== m);
      setFormulaParamsText(JSON.stringify(o, null, 2));
    } catch {}
  };

  // Event API Readout (Major MLB) state
  const [showEventReadout, setShowEventReadout] = useState(false);
  const [eventReadoutLoading, setEventReadoutLoading] = useState(false);
  const [eventReadoutError, setEventReadoutError] = useState('');
  const [eventReadout, setEventReadout] = useState(null);

  // Add propCloseTime state and formatting helper
  const [propCloseTime, setPropCloseTime] = useState('');
  const formatDateTimeLocal = (iso) => {
    const dt = new Date(iso);
    const pad = (n) => n.toString().padStart(2, '0');
    return `${dt.getFullYear()}-${pad(dt.getMonth()+1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
  };

  // Add propOpenTime state and default helper
  const [propOpenTime, setPropOpenTime] = useState('');
  const computeDefaultOpenTime = () => {
    // Default to 12:00 local time of the current day
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    return formatDateTimeLocal(date.toISOString());
  };
  useEffect(() => {
    // On initial load, default both open/close times to 12:00 local time of today
    const noonToday = computeDefaultOpenTime();
    setPropOpenTime(noonToday);
  }, []);

  useEffect(() => {
    if (!eventId) return;
    const fetchEvent = async () => {
      try {
        const res = await fetch(`/api/admin/events/${eventId}`);
        const data = await res.json();
        if (data.success) setEvent(data.event);
      } catch (err) {
        console.error('Error fetching event details:', err);
      }
    };
    fetchEvent();
  }, [eventId]);
  // No remote formulas: using hardcoded list above
  // Compute team cover when source is homeTeam/awayTeam and event is loaded
  useEffect(() => {
    if (!event) return;
    if (propCoverSource !== 'homeTeam' && propCoverSource !== 'awayTeam') return;
    (async () => {
      try {
        const res = await fetch('/api/teams');
        const data = await res.json();
        if (!data.success) return;
        const options = data.teams.filter(t => t.teamType === event.eventLeague);
        // Determine which linked team recordId to use
        const linkIds = propCoverSource === 'homeTeam' ? (event.homeTeamLink || []) : (event.awayTeamLink || []);
        const teamId = Array.isArray(linkIds) && linkIds.length ? linkIds[0] : null;
        if (!teamId) {
          setTeamCoverUrl(null);
          return;
        }
        const team = options.find(t => t.recordId === teamId);
        const url = team?.teamLogoURL || (Array.isArray(team?.teamLogo) && team.teamLogo[0]?.url) || null;
        setTeamCoverUrl(url);
        setCoverPreview(url);
      } catch (e) {
        console.error('Error computing team cover URL:', e);
      }
    })();
  }, [event, propCoverSource]);
  // Load teams for this event's league and initialize selected teams
  useEffect(() => {
    if (!event) return;
    (async () => {
      try {
        const res = await fetch('/api/teams');
        const data = await res.json();
        if (data.success) {
          const options = data.teams.filter(t => t.teamType === event.eventLeague);
          setTeamOptions(options);
          const initial = [];
          if (event.homeTeamLink) initial.push(...event.homeTeamLink);
          if (event.awayTeamLink) initial.push(...event.awayTeamLink);
          setSelectedTeams(initial);
          // Default close time to when the event starts
          if (event?.eventTime) {
            setPropCloseTime(formatDateTimeLocal(event.eventTime));
          }
        }
      } catch (err) {
        console.error('Error fetching teams:', err);
      }
    })();
  }, [event]);

  // Derive friendly team names for labels
  const homeTeamName = Array.isArray(event?.homeTeam) ? (event?.homeTeam?.[0] || '') : (event?.homeTeam || '');
  const awayTeamName = Array.isArray(event?.awayTeam) ? (event?.awayTeam?.[0] || '') : (event?.awayTeam || '');

  // Build H2H team abv options based on linked event
  const normalizeAbv = (val) => {
    const v = String(val || '').toUpperCase();
    const map = { CWS:'CHW', SDP:'SD', SFG:'SF', TBR:'TB', KCR:'KC', ARZ:'ARI', WSN:'WSH' };
    return map[v] || v;
  };
  const h2hTeamOptions = useMemo(() => {
    const list = [];
    const e = event || {};
    const homeAbvRaw = e.homeTeamAbbreviation || null;
    const awayAbvRaw = e.awayTeamAbbreviation || null;
    if (homeAbvRaw) list.push(normalizeAbv(homeAbvRaw));
    if (awayAbvRaw) list.push(normalizeAbv(awayAbvRaw));
    if (list.length === 0) {
      // Fallback to teamOptions via linked record IDs
      try {
        const homeId = Array.isArray(e.homeTeamLink) && e.homeTeamLink.length ? e.homeTeamLink[0] : null;
        const awayId = Array.isArray(e.awayTeamLink) && e.awayTeamLink.length ? e.awayTeamLink[0] : null;
        const home = homeId ? teamOptions.find(t => t.recordId === homeId) : null;
        const away = awayId ? teamOptions.find(t => t.recordId === awayId) : null;
        if (home?.teamAbbreviation) list.push(normalizeAbv(home.teamAbbreviation));
        if (away?.teamAbbreviation) list.push(normalizeAbv(away.teamAbbreviation));
      } catch {}
    }
    // Deduplicate and filter empties
    return Array.from(new Set(list.filter(Boolean)));
  }, [event, teamOptions]);
  useEffect(() => {
    if (gradingMode !== 'auto' || gradingType !== 'h2h') return;
    if ((!teamAbvA || !teamAbvB) && h2hTeamOptions.length > 0) {
      const a = h2hTeamOptions[0] || '';
      const b = h2hTeamOptions[1] || h2hTeamOptions[0] || '';
      if (!teamAbvA && a) { setTeamAbvA(a); upsertRootParam('teamAbvA', a); }
      if (!teamAbvB && b) { setTeamAbvB(b); upsertRootParam('teamAbvB', b); }
    }
  }, [gradingMode, gradingType, h2hTeamOptions]);

  // Default team abv when switching to Individual team mode
  useEffect(() => {
    if (gradingMode !== 'auto' || gradingType !== 'individual') return;
    if (individualMode !== 'team') return;
    if (!formulaTeamAbv && h2hTeamOptions.length > 0) {
      const abv = h2hTeamOptions[0];
      setFormulaTeamAbv(abv);
      upsertRootParam('teamAbv', abv);
    }
  }, [gradingMode, gradingType, individualMode, h2hTeamOptions, formulaTeamAbv]);

  // Clear conflicting params when switching Individual mode
  useEffect(() => {
    if (gradingMode !== 'auto' || gradingType !== 'individual') return;
    if (individualMode === 'team') {
      setFormulaPlayerId('');
      upsertRootParam('playerId', '');
    } else if (individualMode === 'player') {
      setFormulaTeamAbv('');
      upsertRootParam('teamAbv', '');
    }
  }, [gradingMode, gradingType, individualMode]);

  // Load players for Stat O/U, Player H2H, and Multi Stat O/U from MLB boxscore; roster fallback if needed
  useEffect(() => {
    if (!(autoGradeKey === 'stat_over_under' || autoGradeKey === 'player_h2h' || autoGradeKey === 'player_multi_stat_ou')) return;
    if (!event?.espnGameID) return;
    const espnId = String(event.espnGameID).trim();
    const rawHome = event?.homeTeamAbbreviation;
    const rawAway = event?.awayTeamAbbreviation;
    const norm = (v) => {
      const map = { CWS:'CHW', SDP:'SD', SFG:'SF', TBR:'TB', KCR:'KC', ARZ:'ARI', WSN:'WSH' };
      const s = String(v || '').toUpperCase();
      return map[s] || s;
    };
    const abvs = Array.from(new Set([norm(rawHome), norm(rawAway)].filter(Boolean)));
    setPlayersLoading(true);
    setPlayersError('');
    setPlayersById({});
    (async () => {
      try {
        const box = await fetch(`/api/admin/api-tester/boxscore?source=major-mlb&gameID=${encodeURIComponent(espnId)}`);
        const boxJson = await box.json();
        let map = (box.ok && boxJson?.normalized?.playersById) ? boxJson.normalized.playersById : {};
        if (!Object.keys(map || {}).length && abvs.length) {
          try {
            const season = (() => { try { return event?.eventTime ? String(new Date(event.eventTime).getFullYear()) : String(new Date().getFullYear()); } catch { return String(new Date().getFullYear()); } })();
            const roster = await fetch(`/api/admin/api-tester/players?teamAbv=${encodeURIComponent(abvs.join(','))}&season=${encodeURIComponent(season)}`);
            const rosterJson = await roster.json();
            if (roster.ok && rosterJson?.success && rosterJson.playersById) {
              map = rosterJson.playersById;
            }
          } catch {}
        }
        setPlayersById(map || {});
        if (!Object.keys(map || {}).length) setPlayersError('No players found for this event');
      } catch (e) {
        setPlayersError(e.message || 'Failed to fetch players');
      } finally {
        setPlayersLoading(false);
      }
    })();
  }, [autoGradeKey, event?.espnGameID, event?.homeTeamAbbreviation, event?.awayTeamAbbreviation]);

  // Clear conflicting params when switching H2H mode
  useEffect(() => {
    if (gradingMode !== 'auto' || gradingType !== 'h2h') return;
    if (h2hMode === 'team') {
      setPlayerAId('');
      setPlayerBId('');
      upsertRootParam('playerAId', '');
      upsertRootParam('playerBId', '');
    } else if (h2hMode === 'player') {
      setTeamAbvA('');
      setTeamAbvB('');
      upsertRootParam('teamAbvA', '');
      upsertRootParam('teamAbvB', '');
    }
  }, [h2hMode, gradingMode, gradingType]);

  // Quick setters for open/close time helpers based on event
  const setOpenOneHourBeforeEvent = () => {
    if (!event?.eventTime) return;
    const dt = new Date(event.eventTime);
    dt.setHours(dt.getHours() - 1);
    setPropOpenTime(formatDateTimeLocal(dt.toISOString()));
  };

  const setOpenNoonESTOfEventDay = () => {
    if (!event?.eventTime) return;
    const eventDate = new Date(event.eventTime);
    // Get event day parts in America/New_York
    const dateParts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(eventDate);
    const partMap = Object.fromEntries(dateParts.map(p => [p.type, p.value]));
    const yyyy = partMap.year;
    const mm = partMap.month;
    const dd = partMap.day;
    // Determine the EST/EDT offset for that day
    const offsetParts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      timeZoneName: 'shortOffset',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(eventDate);
    const tzNamePart = offsetParts.find(p => p.type === 'timeZoneName');
    // Fallback to -05:00 if parsing fails
    let offset = '-05:00';
    if (tzNamePart?.value) {
      const match = tzNamePart.value.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/i) || tzNamePart.value.match(/UTC([+-])(\d{1,2})(?::?(\d{2}))?/i);
      if (match) {
        const sign = match[1];
        const hh = String(Math.abs(parseInt(match[2], 10))).padStart(2, '0');
        const mmOff = String(match[3] ? parseInt(match[3], 10) : 0).padStart(2, '0');
        offset = `${sign}${hh}:${mmOff}`;
      }
    }
    const estNoonIso = `${yyyy}-${mm}-${dd}T12:00:00${offset}`;
    const localEquivalent = new Date(estNoonIso);
    setPropOpenTime(formatDateTimeLocal(localEquivalent.toISOString()));
  };

  const setCloseTenMinutesAfterEvent = () => {
    if (!event?.eventTime) return;
    const dt = new Date(event.eventTime);
    dt.setMinutes(dt.getMinutes() + 10);
    setPropCloseTime(formatDateTimeLocal(dt.toISOString()));
  };

  // Fetch Major MLB scoreboard readout for the linked event
  const fetchEventApiReadout = async () => {
    if (!event?.eventTime) return;
    setEventReadoutLoading(true);
    setEventReadoutError('');
    setEventReadout(null);
    try {
      const d = new Date(event.eventTime);
      const gameDate = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
      const espnId = String(event?.espnGameID || '').trim();
      const params = new URLSearchParams();
      params.set('source', 'major-mlb');
      if (gameDate) params.set('gameDate', gameDate);
      if (espnId) params.set('gameID', espnId);
      const resp = await fetch(`/api/admin/api-tester/status?${params.toString()}`);
      const json = await resp.json();
      if (!resp.ok || !json.success) throw new Error(json.error || 'Failed to fetch event readout');
      const games = Array.isArray(json.games) ? json.games : [];
      setEventReadout(games[0] || null);
    } catch (e) {
      setEventReadoutError(e.message || 'Failed to fetch event readout');
    } finally {
      setEventReadoutLoading(false);
    }
  };
  // Ensure formulaParams snapshot includes espnGameID, gameDate, and team abvs for who_wins
  useEffect(() => {
    if (autoGradeKey !== 'who_wins') return;
    if (!event) return;
    try {
      const gid = String(event?.espnGameID || '').trim();
      if (gid) upsertRootParam('espnGameID', gid);
    } catch {}
    try {
      if (event?.eventTime) {
        const d = new Date(event.eventTime);
        const gameDate = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
        upsertRootParam('gameDate', gameDate);
      }
    } catch {}
    try {
      const rawHome = event?.homeTeamAbbreviation;
      const rawAway = event?.awayTeamAbbreviation;
      const homeAbv = rawHome ? normalizeAbv(rawHome) : '';
      const awayAbv = rawAway ? normalizeAbv(rawAway) : '';
      if (homeAbv || awayAbv) {
        const obj = formulaParamsText && formulaParamsText.trim() ? JSON.parse(formulaParamsText) : {};
        obj.teams = { homeAbv, awayAbv };
        setFormulaParamsText(JSON.stringify(obj, null, 2));
      }
    } catch {}
  }, [autoGradeKey, event?.espnGameID, event?.eventTime, event?.homeTeamAbbreviation, event?.awayTeamAbbreviation]);
  useEffect(() => {
    if (autoGradeKey === 'who_wins') {
      if (!eventReadout && !eventReadoutLoading) fetchEventApiReadout();
      if (!sideAMap) setSideAMap('away');
      if (!sideBMap) setSideBMap('home');
    }
    if (autoGradeKey === 'stat_over_under') {
      // ensure base params exist
      try {
        const gid = String(event?.espnGameID || '').trim();
        if (gid) upsertRootParam('espnGameID', gid);
      } catch {}
      try {
        if (event?.eventTime) {
          const d = new Date(event.eventTime);
          const gameDate = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
          upsertRootParam('gameDate', gameDate);
        }
      } catch {}
      // lock entity to player for MVP
      try { upsertRootParam('entity', 'player'); } catch {}
      try {
        const obj = formulaParamsText && formulaParamsText.trim() ? JSON.parse(formulaParamsText) : {};
        if (!obj.sides) {
          obj.sides = { A: { comparator: 'gte', threshold: 6 }, B: { comparator: 'lte', threshold: 5 } };
          setFormulaParamsText(JSON.stringify(obj, null, 2));
        }
      } catch {}
    }
    if (autoGradeKey === 'team_stat_over_under') {
      // ensure base params exist
      try {
        const gid = String(event?.espnGameID || '').trim();
        if (gid) upsertRootParam('espnGameID', gid);
      } catch {}
      try {
        if (event?.eventTime) {
          const d = new Date(event.eventTime);
          const gameDate = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
          upsertRootParam('gameDate', gameDate);
        }
      } catch {}
      try { upsertRootParam('entity', 'team'); } catch {}
      try {
        const obj = formulaParamsText && formulaParamsText.trim() ? JSON.parse(formulaParamsText) : {};
        if (!obj.sides) {
          obj.sides = { A: { comparator: 'gte', threshold: 1 }, B: { comparator: 'lte', threshold: 0 } };
          setFormulaParamsText(JSON.stringify(obj, null, 2));
        }
      } catch {}
      // Seed teamAbv from event
      try {
        const rawHome = event?.homeTeamAbbreviation;
        const rawAway = event?.awayTeamAbbreviation;
        const map = { CWS:'CHW', SDP:'SD', SFG:'SF', TBR:'TB', KCR:'KC', ARZ:'ARI', WSN:'WSH' };
        const norm = (v)=> map[String(v||'').toUpperCase()] || String(v||'').toUpperCase();
        const awayAbv = rawAway ? norm(rawAway) : '';
        const obj = formulaParamsText && formulaParamsText.trim() ? JSON.parse(formulaParamsText) : {};
        if (!obj.teamAbv && awayAbv) { obj.teamAbv = awayAbv; setFormulaParamsText(JSON.stringify(obj, null, 2)); }
      } catch {}
    }
  }, [autoGradeKey]);

  // Load metric keys for Stat O/U, Player H2H, and Player Multi Stat O/U
  useEffect(() => {
    if (!(autoGradeKey === 'stat_over_under' || autoGradeKey === 'player_h2h' || autoGradeKey === 'player_multi_stat_ou' || autoGradeKey === 'team_stat_over_under')) return;
    const gid = String(event?.espnGameID || '').trim();
    if (!gid) return;
    setMetricLoading(true);
    setMetricError('');
    setMetricOptions([]);
    (async () => {
      try {
        const resp = await fetch(`/api/admin/api-tester/boxscore?source=major-mlb&gameID=${encodeURIComponent(gid)}`);
        const json = await resp.json();
        if (resp.ok && json?.success) {
          let keys = Array.isArray(json?.normalized?.statKeys) ? json.normalized.statKeys : [];
          if (autoGradeKey === 'team_stat_over_under') {
            keys = Array.from(new Set([...(keys || []), 'R', 'H', 'E']));
          }
          setMetricOptions(keys);
        } else {
          setMetricError(json?.error || 'Failed to load stat keys');
        }
      } catch (e) {
        setMetricError(e.message || 'Failed to load stat keys');
      } finally {
        setMetricLoading(false);
      }
    })();
  }, [autoGradeKey, event?.espnGameID]);
  // For Team Stat H2H, prefer boxscore keys if available; also include classic R/H/E
  useEffect(() => {
    if (autoGradeKey !== 'team_stat_h2h') return;
    const gid = String(event?.espnGameID || '').trim();
    if (!gid) {
      setMetricOptions(['R', 'H', 'E']);
      setMetricError('');
      setMetricLoading(false);
      return;
    }
    setMetricLoading(true);
    setMetricError('');
    setMetricOptions([]);
    (async () => {
      try {
        const resp = await fetch(`/api/admin/api-tester/boxscore?source=major-mlb&gameID=${encodeURIComponent(gid)}`);
        const json = await resp.json();
        let keys = Array.isArray(json?.normalized?.statKeys) ? json.normalized.statKeys : [];
        const augmented = Array.from(new Set([...(keys || []), 'R', 'H', 'E']));
        setMetricOptions(augmented);
      } catch (e) {
        setMetricOptions(['R', 'H', 'E']);
      } finally {
        setMetricLoading(false);
      }
    })();
  }, [autoGradeKey, event?.espnGameID]);
  // Ensure base params for Team Stat H2H and seed defaults
  useEffect(() => {
    if (autoGradeKey !== 'team_stat_h2h') return;
    try {
      const gid = String(event?.espnGameID || '').trim();
      if (gid) upsertRootParam('espnGameID', gid);
      if (event?.eventTime) {
        const d = new Date(event.eventTime);
        const gameDate = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
        upsertRootParam('gameDate', gameDate);
      }
      upsertRootParam('entity', 'team');
    } catch {}
    // Initialize team abvs from event if not set
    try {
      const rawHome = event?.homeTeamAbbreviation;
      const rawAway = event?.awayTeamAbbreviation;
      const map = { CWS:'CHW', SDP:'SD', SFG:'SF', TBR:'TB', KCR:'KC', ARZ:'ARI', WSN:'WSH' };
      const norm = (v)=> map[String(v||'').toUpperCase()] || String(v||'').toUpperCase();
      if (!teamAbvA && rawAway) { const a = norm(rawAway); setTeamAbvA(a); upsertRootParam('teamAbvA', a); }
      if (!teamAbvB && rawHome) { const b = norm(rawHome); setTeamAbvB(b); upsertRootParam('teamAbvB', b); }
    } catch {}
  }, [autoGradeKey, event?.espnGameID, event?.eventTime, event?.homeTeamAbbreviation, event?.awayTeamAbbreviation]);
  // Ensure base params for Player Multi Stat O/U and seed defaults
  useEffect(() => {
    if (autoGradeKey !== 'player_multi_stat_ou') return;
    try {
      const gid = String(event?.espnGameID || '').trim();
      if (gid) upsertRootParam('espnGameID', gid);
      if (event?.eventTime) {
        const d = new Date(event.eventTime);
        const gameDate = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
        upsertRootParam('gameDate', gameDate);
      }
      upsertRootParam('entity', 'player');
    } catch {}
    try {
      const obj = formulaParamsText && formulaParamsText.trim() ? JSON.parse(formulaParamsText) : {};
      if (!obj.sides) {
        obj.sides = { A: { comparator: 'gte', threshold: 1 }, B: { comparator: 'lte', threshold: 0 } };
        setFormulaParamsText(JSON.stringify(obj, null, 2));
      }
      if (!Array.isArray(obj.metrics)) {
        obj.metrics = [];
        setFormulaParamsText(JSON.stringify(obj, null, 2));
      }
    } catch {}
  }, [autoGradeKey, event?.espnGameID, event?.eventTime]);
  useEffect(() => {
    if (autoGradeKey !== 'who_wins') return;
    try {
      upsertRootParam('whoWins', { sideAMap: sideAMap || '', sideBMap: sideBMap || '' });
    } catch {}
  }, [autoGradeKey, sideAMap, sideBMap]);

  // Helpers to derive default formula params from event
  const deriveBaseFormulaParams = () => {
    const league = (event?.eventLeague || '').toString().toLowerCase();
    const espnEventId = event?.espnGameID || '';
    const dt = event?.eventTime ? new Date(event.eventTime) : null;
    const gameDate = dt ? `${dt.getFullYear()}${String(dt.getMonth()+1).padStart(2,'0')}${String(dt.getDate()).padStart(2,'0')}` : '';
    return {
      league,
      eventId: espnEventId,
      espnGameID: espnEventId,
      gameDate,
      timeframe: 'game',
    };
  };

  const handleSelectFormula = (key) => {
    setSelectedFormulaKey(key);
    const f = formulas.find((x) => x.formulaKey === key);
    const base = deriveBaseFormulaParams();
    const defaults = (f && typeof f.defaultParams === 'object' && f.defaultParams) ? f.defaultParams : {};
    const dataSource = f?.dataSource || 'major-mlb';
    // Initialize per-side controls for strikeouts O/U default example
    // We encode per-side settings under { sides: { A: { comparator, threshold }, B: { comparator, threshold } } }
    let merged = { dataSource, ...defaults, ...base };
    try {
      // If this is our strikeouts formula, seed typical defaults
      if (key === 'mlb_player_strikeouts_ou') {
        merged = {
          ...merged,
          sides: {
            A: { comparator: 'gte', threshold: 6 },
            B: { comparator: 'lte', threshold: 5 },
          },
        };
        setSideAComparator('gte');
        setSideAThreshold('6');
        setSideBComparator('lte');
        setSideBThreshold('5');
      }
    } catch {}
    try {
      setFormulaParamsText(JSON.stringify(merged, null, 2));
    } catch {
      setFormulaParamsText('');
    }
  };

  // Helper to upsert per-side settings inside formulaParamsText JSON
  const upsertSidesInParams = (newSides) => {
    try {
      const obj = formulaParamsText && formulaParamsText.trim() ? JSON.parse(formulaParamsText) : {};
      obj.sides = { ...(obj.sides || {}), ...newSides };
      setFormulaParamsText(JSON.stringify(obj, null, 2));
    } catch {
      // if parse fails, rebuild minimal object with just sides
      setFormulaParamsText(JSON.stringify({ sides: newSides }, null, 2));
    }
  };
  const upsertRootParam = (key, value) => {
    try {
      const obj = formulaParamsText && formulaParamsText.trim() ? JSON.parse(formulaParamsText) : {};
      obj[key] = value;
      setFormulaParamsText(JSON.stringify(obj, null, 2));
    } catch {
      setFormulaParamsText(JSON.stringify({ [key]: value }, null, 2));
    }
  };

  // Persist gradingType into params when toggled
  useEffect(() => {
    if (gradingMode !== 'auto') return;
    try { upsertRootParam('gradingType', gradingType); } catch {}
  }, [gradingType, gradingMode]);

  // Handler to fetch moneyline odds and prefill form
  const handlePopulateMoneyline = async () => {
    console.log(`[Populate Moneyline] Button clicked, Airtable record ID=${eventId}`);
    if (!event) {
      console.warn('[Populate Moneyline] No event loaded; aborting');
      return;
    }
    const gameId = event.espnGameID;
    console.log(`[Populate Moneyline] Using espnGameID=${gameId} for API call`);
    if (!gameId) {
      console.error('[Populate Moneyline] espnGameID missing on event; aborting');
      setError('Missing espnGameID on event record');
      setLoading(false);
      return;
    }
    console.log('[Populate Moneyline] Setting loading state to true');
    setLoading(true);
    console.log('[Populate Moneyline] Clearing previous errors');
    setError(null);
    const leagueParam = `baseball/${event.eventLeague}`;
    console.log(`[Populate Moneyline] leagueParam=${leagueParam}`);
    const url = `/api/admin/vegas-odds?eventId=${gameId}&league=${encodeURIComponent(
      leagueParam
    )}&providerId=58`;
    console.log(`[Populate Moneyline] Fetching URL: ${url}`);
    try {
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      console.log(`[Populate Moneyline] Fetch response status=${res.status}`);
      if (!res.ok) {
        console.error(`[Populate Moneyline] Fetch failed with status=${res.status}`);
        throw new Error(`Error ${res.status}: ${res.statusText}`);
      }
      const data = await res.json();
      console.log('[Populate Moneyline] Received data:', data);
      // Use Airtable event fields for team names (unwrap arrays)
      const awayRaw = event.awayTeam;
      const homeRaw = event.homeTeam;
      const away = Array.isArray(awayRaw) ? awayRaw[0] : awayRaw || '';
      const home = Array.isArray(homeRaw) ? homeRaw[0] : homeRaw || '';
      console.log(
        `[Populate Moneyline] Mapping teams from Airtable: away="${away}", home="${home}"`
      );
      console.log(
        `[Populate Moneyline] Odds fetched: awayMoneyline=${data.awayTeamOdds.moneyLine}, homeMoneyline=${data.homeTeamOdds.moneyLine}`
      );
      // Prefill form fields
      console.log('[Populate Moneyline] Prefilling form fields with Airtable names and odds');
      setPropSideAShort(away);
      setPropSideBShort(home);
      const shortLabel = `Moneyline: ${away} vs ${home}`;
      const summaryText =
        `Moneyline odds for ${away} vs ${home}: ${away} ${data.awayTeamOdds.moneyLine}, ${home} ${data.homeTeamOdds.moneyLine}`;
      console.log(
        `[Populate Moneyline] Setting propShort="${shortLabel}", propSummary="${summaryText}"`
      );
      console.log(
        `[Populate Moneyline] About to set sideAMoneyline to ${data.awayTeamOdds.moneyLine} and sideBMoneyline to ${data.homeTeamOdds.moneyLine}`
      );
      // Populate moneyline fields (cast to string for input value)
      const mA = String(data.awayTeamOdds.moneyLine);
      const mB = String(data.homeTeamOdds.moneyLine);
      setPropSideAMoneyline(mA);
      console.log(`[Populate Moneyline] propSideAMoneyline state set to "${mA}"`);
      setPropSideBMoneyline(mB);
      console.log(`[Populate Moneyline] propSideBMoneyline state set to "${mB}"`);
      // Auto-populate 'take' fields
      const takeA = `${away} beat the ${home}`;
      const takeB = `${home} beat the ${away}`;
      console.log(
        `[Populate Moneyline] Setting sideATake="${takeA}", sideBTake="${takeB}"`
      );
      setPropSideATake(takeA);
      setPropSideBTake(takeB);
      setPropShort(shortLabel);
      // Removed setPropSummary(summaryText) so moneyline populate does not overwrite the summary
    } catch (err) {
      console.error('[Populate Moneyline] Error during fetch or processing:', err);
      setError(err.message);
    } finally {
      setLoading(false);
      console.log('[Populate Moneyline] Loading state set to false');
    }
  };

  // Handler to generate AI summary
  const handleGenerateSummary = async (context, model) => {
    if (!eventId) {
      setError('Missing eventId for summary generation');
      return;
    }
    setGeneratingSummary(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/generatePropSummary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId, context, model }),
      });
      const data = await res.json();
      if (data.success) {
        return data.summary;
      } else {
        setError(data.error || 'AI summary generation failed');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setGeneratingSummary(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!eventId) {
      setError('Missing eventId in query');
      return;
    }
    setLoading(true);
    setError(null);
    // Upload cover image if provided and source is custom
    let propCoverUrl = null;
    if (propCoverSource === 'custom' && coverFile) {
      const toBase64 = file => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = err => reject(err);
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
    }
    try {
      const res = await fetch('/api/props', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
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
          eventId,
          teams: selectedTeams,
          propOpenTime,
          propCloseTime,
          propCoverSource,
          // For team logo sources, do not persist propCover; resolve dynamically at read time
          ...(propCoverUrl ? { propCover: propCoverUrl } : {}),
          gradingMode: autoGradeKey ? 'auto' : 'manual',
          formulaKey: autoGradeKey || undefined,
          formulaParams: formulaParamsText || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        router.push(`/admin/events/${eventId}`);
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 max-w-6xl mx-auto">
      {event ? (
        <div className="mb-4 p-4 bg-gray-100 rounded">
          <h2 className="text-xl font-semibold">What event is this prop linked to?</h2>
          <div className="mt-1">
            <div className="font-medium">{event.eventTitle}</div>
            <p>Time: {new Date(event.eventTime).toLocaleString()}</p>
            <p>League: {event.eventLeague}</p>
          </div>
          <div className="mt-2 text-sm">
            <div className="font-medium">Linked Event</div>
            {(() => {
              const league = String(event?.eventLeague || '').toLowerCase();
              const gid = String(event?.espnGameID || '').trim();
              if (!gid) return (<div className="text-gray-700">No ESPN event linked</div>);
              const url = `https://www.espn.com/${league}/game/_/gameId/${gid}`;
              return (
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 underline"
                >
                  View on ESPN (gameId {gid})
                </a>
              );
            })()}
          </div>
        </div>
      ) : (
        <p className="mb-4">Loading event data...</p>
      )}
      {/* Event API Readout */}
      {event && (
        <div className="mb-4 p-4 border rounded bg-white">
          <div className="flex items-center justify-between">
            <div className="text-lg font-semibold">Event API Readout</div>
            <button
              type="button"
              onClick={() => { const next = !showEventReadout; setShowEventReadout(next); if (next && !eventReadout && !eventReadoutLoading) fetchEventApiReadout(); }}
              className="text-sm text-blue-600 underline"
            >
              {showEventReadout ? 'Hide' : 'Show'}
            </button>
          </div>
          <p className="text-sm text-gray-600 mt-1">Live readout from Major MLB for the linked event.</p>
          {showEventReadout && (
            <div className="mt-3 text-sm">
              {eventReadoutLoading && <div className="text-gray-600">Loading…</div>}
              {!!eventReadoutError && <div className="text-red-600">{eventReadoutError}</div>}
              {!eventReadoutLoading && !eventReadoutError && eventReadout && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <div>
                    <div className="font-medium">Basic</div>
                    <div className="text-gray-700">ID: {eventReadout.id || '–'}</div>
                    <div className="text-gray-700">Away/Home: {eventReadout.away || '–'} @ {eventReadout.home || '–'}</div>
                    <div className="text-gray-700">Status: {eventReadout.gameStatus || '–'}</div>
                    <div className="text-gray-700">When: {eventReadout.gameTime ? new Date(eventReadout.gameTime).toLocaleString() : '–'}</div>
                  </div>
                  <div>
                    <div className="font-medium">Line Score</div>
                    <div className="text-gray-700">Away R/H/E: {eventReadout?.lineScore?.away?.R ?? '–'}/{eventReadout?.lineScore?.away?.H ?? '–'}/{eventReadout?.lineScore?.away?.E ?? '–'}</div>
                    <div className="text-gray-700">Home R/H/E: {eventReadout?.lineScore?.home?.R ?? '–'}/{eventReadout?.lineScore?.home?.H ?? '–'}/{eventReadout?.lineScore?.home?.E ?? '–'}</div>
                  </div>
                </div>
              )}
              {!eventReadoutLoading && !eventReadoutError && !eventReadout && (
                <div className="text-gray-600">No event found for this date and ESPN ID.</div>
              )}
            </div>
          )}
        </div>
      )}
      {/* Auto Grade Type (Formulas) */}
      {event && (
        <div className="mb-4 p-4 border rounded bg-white">
          <div className="text-lg font-semibold">Auto Grade</div>
          <label className="block text-sm font-medium text-gray-700 mt-2">Auto Grade Type</label>
          <select
            className="mt-1 block w-full border rounded px-2 py-1"
            value={autoGradeKey}
            onChange={(e) => {
              const key = e.target.value;
              setAutoGradeKey(key);
              handleSelectFormula(key);
            }}
          >
            <option value="">Manual Grade</option>
            {formulas.map((f) => (
              <option key={f.formulaKey} value={f.formulaKey}>{f.displayName || f.formulaKey}</option>
            ))}
            {!formulas.some(f => f.formulaKey === 'who_wins') && (
              <option value="who_wins">Who Wins</option>
            )}
          </select>
          <p className="text-xs text-gray-600 mt-1">
            {(() => {
              const f = formulas.find(x => x.formulaKey === autoGradeKey);
              if (f?.description) return f.description;
              if (autoGradeKey === 'who_wins') return 'Grades based on final winner using Major MLB scoreboard.';
              return 'Choose how this prop should be automatically graded.';
            })()}
          </p>
          {autoGradeKey === 'who_wins' && (
            <div className="mt-3 space-y-2">
              <div className="text-sm font-medium text-gray-700">Map takes to teams</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm">Take A Team</label>
                  <select className="mt-1 block w-full border rounded px-2 py-1" value={sideAMap} onChange={(e) => setSideAMap(e.target.value)}>
                    <option value="away">{awayTeamName || eventReadout?.away || 'Away'}</option>
                    <option value="home">{homeTeamName || eventReadout?.home || 'Home'}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm">Take B Team</label>
                  <select className="mt-1 block w-full border rounded px-2 py-1" value={sideBMap} onChange={(e) => setSideBMap(e.target.value)}>
                    <option value="home">{homeTeamName || eventReadout?.home || 'Home'}</option>
                    <option value="away">{awayTeamName || eventReadout?.away || 'Away'}</option>
                  </select>
                </div>
              </div>
              {eventReadout && (
                <div className="mt-2 p-2 bg-gray-50 rounded border text-sm">
                  <div className="font-medium mb-1">Runs preview</div>
                  <div>Home ({homeTeamName || eventReadout.home}): {eventReadout?.lineScore?.home?.R ?? '–'}</div>
                  <div>Away ({awayTeamName || eventReadout.away}): {eventReadout?.lineScore?.away?.R ?? '–'}</div>
                  <div className="text-xs text-gray-600 mt-1">Used to determine winner when Final.</div>
                </div>
              )}
              {!eventReadout && !eventReadoutLoading && (
                <button type="button" onClick={fetchEventApiReadout} className="text-sm text-blue-600 underline">Check event connection</button>
              )}
            </div>
          )}
          {autoGradeKey === 'stat_over_under' && (
            <div className="mt-3 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Metric</label>
                  {metricLoading ? (
                    <div className="mt-1 text-xs text-gray-600">Loading metrics…</div>
                  ) : metricOptions && metricOptions.length > 0 ? (
                    <select
                      className="mt-1 block w-full border rounded px-2 py-1"
                      value={(function(){ try { const o=JSON.parse(formulaParamsText||'{}'); return o.metric||''; } catch { return ''; } })()}
                      onChange={(e)=> upsertRootParam('metric', e.target.value)}
                    >
                      <option value="">Select a metric…</option>
                      {metricOptions.map((k) => (
                        <option key={k} value={k}>{k}</option>
                      ))}
                    </select>
                  ) : (
                    <input className="mt-1 block w-full border rounded px-2 py-1" value={(function(){ try { const o=JSON.parse(formulaParamsText||'{}'); return o.metric||''; } catch { return ''; } })()} onChange={(e)=> upsertRootParam('metric', e.target.value)} placeholder="e.g. SO" />
                  )}
                  {!!metricError && <div className="mt-1 text-xs text-red-600">{metricError}</div>}
                </div>
                <div />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Team Abv</label>
                  <select
                    className="mt-1 block w-full border rounded px-2 py-1"
                    value={formulaTeamAbv}
                    onChange={(e)=>{ const v=e.target.value; setFormulaTeamAbv(v); upsertRootParam('teamAbv', v); try { if (v && playerAId) { const p = playersById?.[playerAId]; const team = String(p?.teamAbv || '').toUpperCase(); if (team !== String(v).toUpperCase()) { setPlayerAId(''); upsertRootParam('playerId',''); } } } catch {} }}
                  >
                    <option value="">(optional) Team filter</option>
                    {(()=>{ try {
                      const rawHome = event?.homeTeamAbbreviation;
                      const rawAway = event?.awayTeamAbbreviation;
                      const map = { CWS:'CHW', SDP:'SD', SFG:'SF', TBR:'TB', KCR:'KC', ARZ:'ARI', WSN:'WSH' };
                      const norm = (v)=> map[String(v||'').toUpperCase()] || String(v||'').toUpperCase();
                      const list = Array.from(new Set([norm(rawHome), norm(rawAway)].filter(Boolean)));
                      return list.map(abv => (<option key={abv} value={abv}>{abv}</option>));
                    } catch { return null; } })()}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Player ID</label>
                  {playersLoading ? (
                    <div className="mt-1 text-xs text-gray-600">Loading players…</div>
                  ) : (
                    <select
                      className="mt-1 block w-full border rounded px-2 py-1"
                      value={playerAId}
                      onChange={(e)=>{ const v=e.target.value; setPlayerAId(v); upsertRootParam('playerId', v); }}
                      disabled={Object.keys(playersById || {}).length === 0}
                    >
                      {Object.keys(playersById || {}).length === 0 ? (
                        <option value="">No players found</option>
                      ) : (
                        <>
                          <option value="">Select a player…</option>
                          {Object.entries(playersById)
                            .filter(([id, p]) => {
                              if (!formulaTeamAbv) return true;
                              return String(p.teamAbv || '').toUpperCase() === String(formulaTeamAbv || '').toUpperCase();
                            })
                            .sort(([, a], [, b]) => String(a.longName || a.id).localeCompare(String(b.longName || b.id)))
                            .map(([id, p]) => (
                              <option key={id} value={id}>{p.longName || id} ({p.teamAbv || ''})</option>
                            ))}
                        </>
                      )}
                    </select>
                  )}
                  {!!playersError && <div className="mt-1 text-xs text-red-600">{playersError}</div>}
                </div>
              </div>
              <div className="border rounded p-3 bg-gray-50">
                <div className="text-sm font-medium text-gray-700 mb-2">Per-side grading rule</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <div className="text-sm font-semibold mb-1">Side A</div>
                    <div className="flex items-center gap-2">
                      <select
                        value={sideAComparator}
                        onChange={(e) => { const v = e.target.value; setSideAComparator(v); upsertSidesInParams({ A: { comparator: v, threshold: Number(sideAThreshold) || 0 } }); }}
                        className="border rounded px-2 py-1"
                      >
                        <option value="gte">Equal or more than</option>
                        <option value="lte">Equal or less than</option>
                      </select>
                      <input
                        type="number"
                        value={sideAThreshold}
                        onChange={(e) => { const v = e.target.value; setSideAThreshold(v); upsertSidesInParams({ A: { comparator: sideAComparator, threshold: Number(v) || 0 } }); }}
                        placeholder="e.g. 6"
                        className="border rounded px-2 py-1 w-24"
                      />
                    </div>
                  </div>
                  <div>
                    <div className="text-sm font-semibold mb-1">Side B</div>
                    <div className="flex items-center gap-2">
                      <select
                        value={sideBComparator}
                        onChange={(e) => { const v = e.target.value; setSideBComparator(v); upsertSidesInParams({ B: { comparator: v, threshold: Number(sideBThreshold) || 0 } }); }}
                        className="border rounded px-2 py-1"
                      >
                        <option value="gte">Equal or more than</option>
                        <option value="lte">Equal or less than</option>
                      </select>
                      <input
                        type="number"
                        value={sideBThreshold}
                        onChange={(e) => { const v = e.target.value; setSideBThreshold(v); upsertSidesInParams({ B: { comparator: sideBComparator, threshold: Number(v) || 0 } }); }}
                        placeholder="e.g. 5"
                        className="border rounded px-2 py-1 w-24"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
          {autoGradeKey === 'team_stat_h2h' && (
            <div className="mt-3 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Metric</label>
                  {metricLoading ? (
                    <div className="mt-1 text-xs text-gray-600">Loading metrics…</div>
                  ) : metricOptions && metricOptions.length > 0 ? (
                    <select
                      className="mt-1 block w-full border rounded px-2 py-1"
                      value={(function(){ try { const o=JSON.parse(formulaParamsText||'{}'); return o.metric||''; } catch { return ''; } })()}
                      onChange={(e)=> upsertRootParam('metric', e.target.value)}
                    >
                      <option value="">Select a metric…</option>
                      {metricOptions.map((k) => (
                        <option key={k} value={k}>{k}</option>
                      ))}
                    </select>
                  ) : (
                    <input className="mt-1 block w-full border rounded px-2 py-1" value={(function(){ try { const o=JSON.parse(formulaParamsText||'{}'); return o.metric||''; } catch { return ''; } })()} onChange={(e)=> upsertRootParam('metric', e.target.value)} placeholder="e.g. R" />
                  )}
                  {!!metricError && <div className="mt-1 text-xs text-red-600">{metricError}</div>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Winner</label>
                  <select
                    className="mt-1 block w-full border rounded px-2 py-1"
                    value={(function(){ try { const o=JSON.parse(formulaParamsText||'{}'); return (o.winnerRule||'higher'); } catch { return 'higher'; } })()}
                    onChange={(e)=>{ try { const o = formulaParamsText && formulaParamsText.trim() ? JSON.parse(formulaParamsText) : {}; o.winnerRule = e.target.value; setFormulaParamsText(JSON.stringify(o, null, 2)); } catch {} }}
                  >
                    <option value="higher">Higher wins</option>
                    <option value="lower">Lower wins</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Team A Abv</label>
                  <select
                    className="mt-1 block w-full border rounded px-2 py-1"
                    value={teamAbvA}
                    onChange={(e)=>{ const v=e.target.value; setTeamAbvA(v); upsertRootParam('teamAbvA', v); }}
                  >
                    <option value="">Select team…</option>
                    {(()=>{ try {
                      const rawHome = event?.homeTeamAbbreviation;
                      const rawAway = event?.awayTeamAbbreviation;
                      const map = { CWS:'CHW', SDP:'SD', SFG:'SF', TBR:'TB', KCR:'KC', ARZ:'ARI', WSN:'WSH' };
                      const norm = (v)=> map[String(v||'').toUpperCase()] || String(v||'').toUpperCase();
                      const list = Array.from(new Set([norm(rawHome), norm(rawAway)].filter(Boolean)));
                      return list.map(abv => (<option key={abv} value={abv}>{abv}</option>));
                    } catch { return null; } })()}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Team B Abv</label>
                  <select
                    className="mt-1 block w-full border rounded px-2 py-1"
                    value={teamAbvB}
                    onChange={(e)=>{ const v=e.target.value; setTeamAbvB(v); upsertRootParam('teamAbvB', v); }}
                  >
                    <option value="">Select team…</option>
                    {(()=>{ try {
                      const rawHome = event?.homeTeamAbbreviation;
                      const rawAway = event?.awayTeamAbbreviation;
                      const map = { CWS:'CHW', SDP:'SD', SFG:'SF', TBR:'TB', KCR:'KC', ARZ:'ARI', WSN:'WSH' };
                      const norm = (v)=> map[String(v||'').toUpperCase()] || String(v||'').toUpperCase();
                      const list = Array.from(new Set([norm(rawHome), norm(rawAway)].filter(Boolean)));
                      return list.map(abv => (<option key={abv} value={abv}>{abv}</option>));
                    } catch { return null; } })()}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Comparison</label>
                  <select
                    value={compareRule}
                    onChange={(e) => { const v = e.target.value; setCompareRule(v); upsertRootParam('compareRule', v); }}
                    className="mt-1 block w-full border rounded px-2 py-1"
                  >
                    <option value="most">Most</option>
                    <option value="least">Least</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Tie Rule</label>
                  <select
                    value={tieRule}
                    onChange={(e) => { const v = e.target.value; setTieRule(v); upsertRootParam('tieRule', v); }}
                    className="mt-1 block w-full border rounded px-2 py-1"
                  >
                    <option value="push">Push</option>
                    <option value="favora">Favor A</option>
                    <option value="favorb">Favor B</option>
                  </select>
                </div>
              </div>
            </div>
          )}
          {autoGradeKey === 'player_multi_stat_ou' && (
            <div className="mt-3 space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700">Metrics</label>
                <div className="mt-1 flex items-center gap-2">
                  {metricLoading ? (
                    <div className="text-xs text-gray-600">Loading metrics…</div>
                  ) : (
                    <select
                      className="border rounded px-2 py-1"
                      onChange={(e)=> { const v=e.target.value; if (v) { addMetric(v); e.target.value=''; } }}
                    >
                      <option value="">Add a metric…</option>
                      {metricOptions.map((k) => (
                        <option key={k} value={k}>{k}</option>
                      ))}
                    </select>
                  )}
                  {!!metricError && <div className="text-xs text-red-600">{metricError}</div>}
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {metricsSelected.length === 0 && (
                    <span className="text-xs text-gray-500">No metrics added</span>
                  )}
                  {metricsSelected.map((m) => (
                    <span key={m} className="inline-flex items-center bg-gray-100 border rounded px-2 py-0.5 text-xs">
                      {m}
                      <button type="button" className="ml-1 text-gray-600 hover:text-gray-800" onClick={()=> removeMetric(m)}>×</button>
                    </span>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Team Abv</label>
                  <select
                    className="mt-1 block w-full border rounded px-2 py-1"
                    value={formulaTeamAbv}
                    onChange={(e)=>{ const v=e.target.value; setFormulaTeamAbv(v); upsertRootParam('teamAbv', v); try { if (v && formulaPlayerId) { const p = playersById?.[formulaPlayerId]; const team = String(p?.teamAbv || '').toUpperCase(); if (team !== String(v).toUpperCase()) { setFormulaPlayerId(''); upsertRootParam('playerId',''); } } } catch {} }}
                  >
                    <option value="">(optional) Team filter</option>
                    {(()=>{ try {
                      const rawHome = event?.homeTeamAbbreviation;
                      const rawAway = event?.awayTeamAbbreviation;
                      const map = { CWS:'CHW', SDP:'SD', SFG:'SF', TBR:'TB', KCR:'KC', ARZ:'ARI', WSN:'WSH' };
                      const norm = (v)=> map[String(v||'').toUpperCase()] || String(v||'').toUpperCase();
                      const list = Array.from(new Set([norm(rawHome), norm(rawAway)].filter(Boolean)));
                      return list.map(abv => (<option key={abv} value={abv}>{abv}</option>));
                    } catch { return null; } })()}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Player</label>
                  {playersLoading ? (
                    <div className="mt-1 text-xs text-gray-600">Loading players…</div>
                  ) : (
                    <select
                      className="mt-1 block w-full border rounded px-2 py-1"
                      value={formulaPlayerId}
                      onChange={(e)=>{ const v=e.target.value; setFormulaPlayerId(v); upsertRootParam('playerId', v); }}
                      disabled={Object.keys(playersById || {}).length === 0}
                    >
                      {Object.keys(playersById || {}).length === 0 ? (
                        <option value="">No players found</option>
                      ) : (
                        <>
                          <option value="">Select a player…</option>
                          {Object.entries(playersById)
                            .filter(([id, p]) => {
                              if (!formulaTeamAbv) return true;
                              return String(p.teamAbv || '').toUpperCase() === String(formulaTeamAbv || '').toUpperCase();
                            })
                            .sort(([, a], [, b]) => String(a.longName || a.id).localeCompare(String(b.longName || b.id)))
                            .map(([id, p]) => (
                              <option key={id} value={id}>{p.longName || id} ({p.teamAbv || ''})</option>
                            ))}
                        </>
                      )}
                    </select>
                  )}
                  {!!playersError && <div className="mt-1 text-xs text-red-600">{playersError}</div>}
                </div>
              </div>
              <div className="border rounded p-3 bg-gray-50">
                <div className="text-sm font-medium text-gray-700 mb-2">Per-side grading rule</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <div className="text-sm font-semibold mb-1">Side A</div>
                    <div className="flex items-center gap-2">
                      <select
                        value={sideAComparator}
                        onChange={(e) => { const v = e.target.value; setSideAComparator(v); upsertSidesInParams({ A: { comparator: v, threshold: Number(sideAThreshold) || 0 } }); }}
                        className="border rounded px-2 py-1"
                      >
                        <option value="gte">Equal or more than</option>
                        <option value="lte">Equal or less than</option>
                      </select>
                      <input
                        type="number"
                        value={sideAThreshold}
                        onChange={(e) => { const v = e.target.value; setSideAThreshold(v); upsertSidesInParams({ A: { comparator: sideAComparator, threshold: Number(v) || 0 } }); }}
                        placeholder="e.g. 6"
                        className="border rounded px-2 py-1 w-24"
                      />
                    </div>
                  </div>
                  <div>
                    <div className="text-sm font-semibold mb-1">Side B</div>
                    <div className="flex items-center gap-2">
                      <select
                        value={sideBComparator}
                        onChange={(e) => { const v = e.target.value; setSideBComparator(v); upsertSidesInParams({ B: { comparator: v, threshold: Number(sideBThreshold) || 0 } }); }}
                        className="border rounded px-2 py-1"
                      >
                        <option value="gte">Equal or more than</option>
                        <option value="lte">Equal or less than</option>
                      </select>
                      <input
                        type="number"
                        value={sideBThreshold}
                        onChange={(e) => { const v = e.target.value; setSideBThreshold(v); upsertSidesInParams({ B: { comparator: sideBComparator, threshold: Number(v) || 0 } }); }}
                        placeholder="e.g. 5"
                        className="border rounded px-2 py-1 w-24"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
          {autoGradeKey === 'player_h2h' && (
            <div className="mt-3 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Metric</label>
                  {metricLoading ? (
                    <div className="mt-1 text-xs text-gray-600">Loading metrics…</div>
                  ) : metricOptions && metricOptions.length > 0 ? (
                    <select
                      className="mt-1 block w-full border rounded px-2 py-1"
                      value={(function(){ try { const o=JSON.parse(formulaParamsText||'{}'); return o.metric||''; } catch { return ''; } })()}
                      onChange={(e)=> upsertRootParam('metric', e.target.value)}
                    >
                      <option value="">Select a metric…</option>
                      {metricOptions.map((k) => (
                        <option key={k} value={k}>{k}</option>
                      ))}
                    </select>
                  ) : (
                    <input className="mt-1 block w-full border rounded px-2 py-1" value={(function(){ try { const o=JSON.parse(formulaParamsText||'{}'); return o.metric||''; } catch { return ''; } })()} onChange={(e)=> upsertRootParam('metric', e.target.value)} placeholder="e.g. SO" />
                  )}
                  {!!metricError && <div className="mt-1 text-xs text-red-600">{metricError}</div>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Winner</label>
                  <select
                    className="mt-1 block w-full border rounded px-2 py-1"
                    value={(function(){ try { const o=JSON.parse(formulaParamsText||'{}'); return (o.winnerRule||'higher'); } catch { return 'higher'; } })()}
                    onChange={(e)=>{ try { const o = formulaParamsText && formulaParamsText.trim() ? JSON.parse(formulaParamsText) : {}; o.winnerRule = e.target.value; setFormulaParamsText(JSON.stringify(o, null, 2)); } catch {} }}
                  >
                    <option value="higher">Higher wins</option>
                    <option value="lower">Lower wins</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Team Abv (A)</label>
                  <select
                    className="mt-1 block w-full border rounded px-2 py-1"
                    value={teamAbvA}
                    onChange={(e)=>{ const v=e.target.value; setTeamAbvA(v); upsertRootParam('teamAbvA', v); try { const obj = JSON.parse(formulaParamsText||'{}'); if (obj.playerAId) { const p = playersById?.[obj.playerAId]; const t = String(p?.teamAbv||'').toUpperCase(); if (t !== String(v).toUpperCase()) { obj.playerAId=''; setFormulaParamsText(JSON.stringify(obj, null, 2)); } } } catch {} }}
                  >
                    <option value="">All…</option>
                    {(()=>{ try {
                      const rawHome = event?.homeTeamAbbreviation;
                      const rawAway = event?.awayTeamAbbreviation;
                      const map = { CWS:'CHW', SDP:'SD', SFG:'SF', TBR:'TB', KCR:'KC', ARZ:'ARI', WSN:'WSH' };
                      const norm = (v)=> map[String(v||'').toUpperCase()] || String(v||'').toUpperCase();
                      const list = Array.from(new Set([norm(rawHome), norm(rawAway)].filter(Boolean)));
                      return list.map(abv => (<option key={abv} value={abv}>{abv}</option>));
                    } catch { return null; } })()}
                  </select>
                  <label className="block text-sm font-medium text-gray-700 mt-2">Player A</label>
                  <select
                    className="mt-1 block w-full border rounded px-2 py-1"
                    value={(function(){ try { const o=JSON.parse(formulaParamsText||'{}'); return o.playerAId||''; } catch { return ''; } })()}
                    onChange={(e)=>{ try { const o = formulaParamsText && formulaParamsText.trim() ? JSON.parse(formulaParamsText) : {}; o.playerAId = e.target.value; setFormulaParamsText(JSON.stringify(o, null, 2)); } catch {} }}
                    disabled={Object.keys(playersById || {}).length === 0}
                  >
                    {Object.keys(playersById || {}).length === 0 ? (
                      <option value="">No players found</option>
                    ) : (
                      <>
                        <option value="">Select a player…</option>
                        {Object.entries(playersById)
                          .filter(([id, p]) => {
                            if (!teamAbvA) return true;
                            return String(p.teamAbv || '').toUpperCase() === String(teamAbvA || '').toUpperCase();
                          })
                          .sort(([, a], [, b]) => String(a.longName || a.id).localeCompare(String(b.longName || b.id)))
                          .map(([id, p]) => (
                            <option key={id} value={id}>{p.longName || id} ({p.teamAbv || ''})</option>
                          ))}
                      </>
                    )}
                  </select>
                </div>
                <div />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Team Abv (B)</label>
                  <select
                    className="mt-1 block w-full border rounded px-2 py-1"
                    value={teamAbvB}
                    onChange={(e)=>{ const v=e.target.value; setTeamAbvB(v); upsertRootParam('teamAbvB', v); try { const obj = JSON.parse(formulaParamsText||'{}'); if (obj.playerBId) { const p = playersById?.[obj.playerBId]; const t = String(p?.teamAbv||'').toUpperCase(); if (t !== String(v).toUpperCase()) { obj.playerBId=''; setFormulaParamsText(JSON.stringify(obj, null, 2)); } } } catch {} }}
                  >
                    <option value="">All…</option>
                    {(()=>{ try {
                      const rawHome = event?.homeTeamAbbreviation;
                      const rawAway = event?.awayTeamAbbreviation;
                      const map = { CWS:'CHW', SDP:'SD', SFG:'SF', TBR:'TB', KCR:'KC', ARZ:'ARI', WSN:'WSH' };
                      const norm = (v)=> map[String(v||'').toUpperCase()] || String(v||'').toUpperCase();
                      const list = Array.from(new Set([norm(rawHome), norm(rawAway)].filter(Boolean)));
                      return list.map(abv => (<option key={abv} value={abv}>{abv}</option>));
                    } catch { return null; } })()}
                  </select>
                  <label className="block text-sm font-medium text-gray-700 mt-2">Player B</label>
                  <select
                    className="mt-1 block w-full border rounded px-2 py-1"
                    value={(function(){ try { const o=JSON.parse(formulaParamsText||'{}'); return o.playerBId||''; } catch { return ''; } })()}
                    onChange={(e)=>{ try { const o = formulaParamsText && formulaParamsText.trim() ? JSON.parse(formulaParamsText) : {}; o.playerBId = e.target.value; setFormulaParamsText(JSON.stringify(o, null, 2)); } catch {} }}
                    disabled={Object.keys(playersById || {}).length === 0}
                  >
                    {Object.keys(playersById || {}).length === 0 ? (
                      <option value="">No players found</option>
                    ) : (
                      <>
                        <option value="">Select a player…</option>
                        {Object.entries(playersById)
                          .filter(([id, p]) => {
                            if (!teamAbvB) return true;
                            return String(p.teamAbv || '').toUpperCase() === String(teamAbvB || '').toUpperCase();
                          })
                          .sort(([, a], [, b]) => String(a.longName || a.id).localeCompare(String(b.longName || b.id)))
                          .map(([id, p]) => (
                            <option key={id} value={id}>{p.longName || id} ({p.teamAbv || ''})</option>
                          ))}
                      </>
                    )}
                  </select>
                </div>
                <div />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Comparison</label>
                  <select
                    value={compareRule}
                    onChange={(e) => { const v = e.target.value; setCompareRule(v); upsertRootParam('compareRule', v); }}
                    className="mt-1 block w-full border rounded px-2 py-1"
                  >
                    <option value="most">Most</option>
                    <option value="least">Least</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Tie Rule</label>
                  <select
                    value={tieRule}
                    onChange={(e) => { const v = e.target.value; setTieRule(v); upsertRootParam('tieRule', v); }}
                    className="mt-1 block w-full border rounded px-2 py-1"
                  >
                    <option value="push">Push</option>
                    <option value="favora">Favor A</option>
                    <option value="favorb">Favor B</option>
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
      {autoGradeKey === 'team_stat_over_under' && (
        <div className="mt-3 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700">Metric</label>
              {metricLoading ? (
                <div className="mt-1 text-xs text-gray-600">Loading metrics…</div>
              ) : metricOptions && metricOptions.length > 0 ? (
                <select
                  className="mt-1 block w-full border rounded px-2 py-1"
                  value={(function(){ try { const o=JSON.parse(formulaParamsText||'{}'); return o.metric||''; } catch { return ''; } })()}
                  onChange={(e)=> upsertRootParam('metric', e.target.value)}
                >
                  <option value="">Select a metric…</option>
                  {metricOptions.map((k) => (
                    <option key={k} value={k}>{k}</option>
                  ))}
                </select>
              ) : (
                <input className="mt-1 block w-full border rounded px-2 py-1" value={(function(){ try { const o=JSON.parse(formulaParamsText||'{}'); return o.metric||''; } catch { return ''; } })()} onChange={(e)=> upsertRootParam('metric', e.target.value)} placeholder="e.g. R" />
              )}
              {!!metricError && <div className="mt-1 text-xs text-red-600">{metricError}</div>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Team Abv</label>
              <select
                className="mt-1 block w-full border rounded px-2 py-1"
                value={(function(){ try { const o=JSON.parse(formulaParamsText||'{}'); return o.teamAbv||''; } catch { return ''; } })()}
                onChange={(e)=>{ try { const o = formulaParamsText && formulaParamsText.trim() ? JSON.parse(formulaParamsText) : {}; o.teamAbv = e.target.value; setFormulaParamsText(JSON.stringify(o, null, 2)); } catch {} }}
              >
                <option value="">Select team…</option>
                {(()=>{ try {
                  const rawHome = event?.homeTeamAbbreviation;
                  const rawAway = event?.awayTeamAbbreviation;
                  const map = { CWS:'CHW', SDP:'SD', SFG:'SF', TBR:'TB', KCR:'KC', ARZ:'ARI', WSN:'WSH' };
                  const norm = (v)=> map[String(v||'').toUpperCase()] || String(v||'').toUpperCase();
                  const list = Array.from(new Set([norm(rawHome), norm(rawAway)].filter(Boolean)));
                  return list.map(abv => (<option key={abv} value={abv}>{abv}</option>));
                } catch { return null; } })()}
              </select>
            </div>
          </div>
          <div className="border rounded p-3 bg-gray-50">
            <div className="text-sm font-medium text-gray-700 mb-2">Per-side grading rule</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <div className="text-sm font-semibold mb-1">Side A</div>
                <div className="flex items-center gap-2">
                  <select
                    value={sideAComparator}
                    onChange={(e) => { const v = e.target.value; setSideAComparator(v); upsertSidesInParams({ A: { comparator: v, threshold: Number(sideAThreshold) || 0 } }); }}
                    className="border rounded px-2 py-1"
                  >
                    <option value="gte">Equal or more than</option>
                    <option value="lte">Equal or less than</option>
                  </select>
                  <input
                    type="number"
                    value={sideAThreshold}
                    onChange={(e) => { const v = e.target.value; setSideAThreshold(v); upsertSidesInParams({ A: { comparator: sideAComparator, threshold: Number(v) || 0 } }); }}
                    placeholder="e.g. 6"
                    className="border rounded px-2 py-1 w-24"
                  />
                </div>
              </div>
              <div>
                <div className="text-sm font-semibold mb-1">Side B</div>
                <div className="flex items-center gap-2">
                  <select
                    value={sideBComparator}
                    onChange={(e) => { const v = e.target.value; setSideBComparator(v); upsertSidesInParams({ B: { comparator: v, threshold: Number(sideBThreshold) || 0 } }); }}
                    className="border rounded px-2 py-1"
                  >
                    <option value="gte">Equal or more than</option>
                    <option value="lte">Equal or less than</option>
                  </select>
                  <input
                    type="number"
                    value={sideBThreshold}
                    onChange={(e) => { const v = e.target.value; setSideBThreshold(v); upsertSidesInParams({ B: { comparator: sideBComparator, threshold: Number(v) || 0 } }); }}
                    placeholder="e.g. 5"
                    className="border rounded px-2 py-1 w-24"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {event && (
        <button
          type="button"
          onClick={handlePopulateMoneyline}
          className="mb-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Populate Moneyline Props
        </button>
      )}
      <h1 className="text-2xl font-bold mb-4">Create a Prop</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        
        <div>
          <label htmlFor="propShort" className="block text-sm font-medium text-gray-700">
            Short Label
          </label>
          <input
            id="propShort"
            type="text"
            value={propShort}
            onChange={(e) => setPropShort(e.target.value)}
            className="mt-1 block w-full border rounded px-2 py-1"
          />
        </div>
        <div>
          <label htmlFor="propValueModel" className="block text-sm font-medium text-gray-700">Value Model</label>
          <select
            id="propValueModel"
            value={propValueModel}
            onChange={(e) => setPropValueModel(e.target.value)}
            className="mt-1 block w-full border rounded px-2 py-1"
          >
            <option value="vegas">Vegas</option>
            <option value="popular">Popular</option>
          </select>
        </div>
        <div>
          <label htmlFor="propSummary" className="block text-sm font-medium text-gray-700">Summary</label>
          <textarea
            id="propSummary"
            value={propSummary}
            onChange={(e) => setPropSummary(e.target.value)}
            className="mt-1 block w-full border rounded px-2 py-1"
          />
        </div>
        <div>
          <button
            type="button"
            onClick={() => {
              const away = Array.isArray(event.awayTeam) ? event.awayTeam[0] : event.awayTeam || '';
              const home = Array.isArray(event.homeTeam) ? event.homeTeam[0] : event.homeTeam || '';
              const eventDateTime = event?.eventTime ? new Date(event.eventTime).toLocaleString() : 'the scheduled time';
              const defaultPrompt = `Search the web for the latest news and statistics around the game between ${away} and ${home} on ${eventDateTime}. Write this in long paragraph format filled with stats and narratives.`;
              const serverPrompt = `Write a 30 words max summary previewing the upcoming game between ${away} and ${home} on ${eventDateTime} in the ${event.eventLeague || ''}, use relevant narratives and stats. A good example is: "Matthews (5.67 ERA, 42 K) opposes Paddack (4.77 ERA, 88 K) as Tigers (66–48) aim to extend their four-game win streak over Twins (52–60)."`;
              openModal('aiSummaryContext', {
                defaultPrompt,
                serverPrompt,
                defaultModel: process.env.NEXT_PUBLIC_OPENAI_DEFAULT_MODEL || 'gpt-4.1',
                onGenerate: handleGenerateSummary,
                onUse: (text) => setPropSummary(text)
              });
            }}
            className="mt-1 text-sm bg-indigo-600 text-white rounded px-3 py-1 hover:bg-indigo-700"
          >
            Generate AI Summary
          </button>
        </div>
        {/* Open Time Field */}
        <div>
          <label htmlFor="propOpenTime" className="block text-sm font-medium text-gray-700">Open Time</label>
          <input
            id="propOpenTime"
            type="datetime-local"
            value={propOpenTime}
            onChange={(e) => setPropOpenTime(e.target.value)}
            className="mt-1 block w-full border rounded px-2 py-1"
          />
          <div className="flex flex-col gap-1 mt-1">
            <p
              className="text-sm text-blue-600 cursor-pointer"
              onClick={setOpenOneHourBeforeEvent}
            >
              1 hour before event time
            </p>
            <p
              className="text-sm text-blue-600 cursor-pointer"
              onClick={setOpenNoonESTOfEventDay}
            >
              12p EST of event day
            </p>
          </div>
        </div>
        <div>
          <label htmlFor="propCloseTime" className="block text-sm font-medium text-gray-700">
            Close Time
          </label>
          <input
            id="propCloseTime"
            type="datetime-local"
            value={propCloseTime}
            onChange={(e) => setPropCloseTime(e.target.value)}
            className="mt-1 block w-full border rounded px-2 py-1"
          />
          <p
            className="text-sm text-blue-600 cursor-pointer"
            onClick={() => setPropCloseTime(formatDateTimeLocal(event.eventTime))}
          >
            When event starts
          </p>
          <p
            className="text-sm text-blue-600 cursor-pointer"
            onClick={setCloseTenMinutesAfterEvent}
          >
            10 minutes after event starts
          </p>
        </div>
        <h3 className="font-semibold">Side A</h3>
        <div>
          <label htmlFor="propSideAShort" className="block text-sm font-medium text-gray-700">Side A Label</label>
          <input
            id="propSideAShort"
            type="text"
            value={propSideAShort}
            onChange={(e) => setPropSideAShort(e.target.value)}
            className="mt-1 block w-full border rounded px-2 py-1"
          />
        </div>
        <div>
          <label htmlFor="propSideATake" className="block text-sm font-medium text-gray-700">Side A Take</label>
          <input
            id="propSideATake"
            type="text"
            value={propSideATake}
            onChange={(e) => setPropSideATake(e.target.value)}
            className="mt-1 block w-full border rounded px-2 py-1"
          />
        </div>
        {propValueModel === 'vegas' && (
          <div>
            <label htmlFor="propSideAMoneyline" className="block text-sm font-medium text-gray-700">Side A Moneyline</label>
            <input
              id="propSideAMoneyline"
              type="number"
              value={propSideAMoneyline}
              onChange={(e) => setPropSideAMoneyline(e.target.value)}
              className="mt-1 block w-full border rounded px-2 py-1"
            />
          </div>
        )}
        <h3 className="font-semibold">Side B</h3>
        <div>
          <label htmlFor="propSideBShort" className="block text-sm font-medium text-gray-700">Side B Label</label>
          <input
            id="propSideBShort"
            type="text"
            value={propSideBShort}
            onChange={(e) => setPropSideBShort(e.target.value)}
            className="mt-1 block w-full border rounded px-2 py-1"
          />
        </div>
        <div>
          <label htmlFor="propSideBTake" className="block text-sm font-medium text-gray-700">Side B Take</label>
          <input
            id="propSideBTake"
            type="text"
            value={propSideBTake}
            onChange={(e) => setPropSideBTake(e.target.value)}
            className="mt-1 block w-full border rounded px-2 py-1"
          />
        </div>
        {propValueModel === 'vegas' && (
          <div>
            <label htmlFor="propSideBMoneyline" className="block text-sm font-medium text-gray-700">Side B Moneyline</label>
            <input
              id="propSideBMoneyline"
              type="number"
              value={propSideBMoneyline}
              onChange={(e) => setPropSideBMoneyline(e.target.value)}
              className="mt-1 block w-full border rounded px-2 py-1"
            />
          </div>
        )}
        <div>
          <label htmlFor="propCoverSource" className="block text-sm font-medium text-gray-700">Cover Image Source</label>
          <select
            id="propCoverSource"
            value={propCoverSource}
            onChange={(e) => {
              const value = e.target.value;
              setPropCoverSource(value);
              if (value === 'event') {
                setCoverFile(null);
                setCoverPreview(null);
              }
              if (value !== 'custom') {
                setCoverFile(null);
              }
            }}
            className="mt-1 block w-full border rounded px-2 py-1"
          >
            <option value="event">Event</option>
            <option value="homeTeam" disabled={!event}>{homeTeamName ? `${homeTeamName} (Home)` : 'Home Team'}</option>
            <option value="awayTeam" disabled={!event}>{awayTeamName ? `${awayTeamName} (Away)` : 'Away Team'}</option>
            <option value="custom">Custom</option>
          </select>
        </div>
        {propCoverSource === 'custom' && (
          <div>
            <label htmlFor="propCover" className="block text-sm font-medium text-gray-700">Prop Cover (optional)</label>
            <input
              id="propCover"
              type="file"
              accept="image/*"
              onChange={(e) => {
                if (e.target.files.length) {
                  setCoverFile(e.target.files[0]);
                  setCoverPreview(URL.createObjectURL(e.target.files[0]));
                }
              }}
              className="mt-1 block w-full"
            />
            {coverPreview && (
              <img src={coverPreview} alt="Cover Preview" className="mt-2 h-32 object-contain" />
            )}
          </div>
        )}
        {(propCoverSource === 'homeTeam' || propCoverSource === 'awayTeam') && teamCoverUrl && (
          <div>
            <label className="block text-sm font-medium text-gray-700">Team Logo Preview</label>
            <img src={teamCoverUrl} alt="Team Logo" className="mt-2 h-32 object-contain" />
          </div>
        )}
        {/* Teams selection chips */}
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
                    active
                      ? 'bg-blue-100 text-blue-800 border border-blue-300'
                      : 'bg-gray-200 text-gray-500 border border-gray-300'
                  }`}
                >
                  {team.teamName}
                </button>
              );
            })}
          </div>
        </div>
        {error && <p className="text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
        >
          {loading ? 'Creating...' : 'Create Prop'}
        </button>
      </form>
    </div>

  );
}