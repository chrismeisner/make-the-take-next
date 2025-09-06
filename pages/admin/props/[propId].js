import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { useModal } from '../../../contexts/ModalContext';
import EventSelector from '../../../components/EventSelector';

export default function EditPropPage() {
  const router = useRouter();
  const { propId } = router.query;
  const { openModal } = useModal();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [generatingSummary, setGeneratingSummary] = useState(false);

  // Form fields (mirroring create-prop, but prefilled)
  const [propShort, setPropShort] = useState('');
  const [propSummary, setPropSummary] = useState('');
  const [propValueModel, setPropValueModel] = useState('vegas');
  const [propType, setPropType] = useState('moneyline');
  const [propStatus, setPropStatus] = useState('open');
  const [PropSideAShort, setPropSideAShort] = useState('');
  const [PropSideATake, setPropSideATake] = useState('');
  const [PropSideAMoneyline, setPropSideAMoneyline] = useState('');
  const [PropSideBShort, setPropSideBShort] = useState('');
  const [PropSideBTake, setPropSideBTake] = useState('');
  const [PropSideBMoneyline, setPropSideBMoneyline] = useState('');
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
    const p = profitFromMoneyline(PropSideAMoneyline);
    return p == null ? null : Math.round(p);
  }, [PropSideAMoneyline]);
  const computedValueB = useMemo(() => {
    const p = profitFromMoneyline(PropSideBMoneyline);
    return p == null ? null : Math.round(p);
  }, [PropSideBMoneyline]);
  const [teams, setTeams] = useState([]);
  const [propOpenTime, setPropOpenTime] = useState('');
  const [propCloseTime, setPropCloseTime] = useState('');
  const [propCoverSource, setPropCoverSource] = useState('event');
  const [event, setEvent] = useState(null);
  // Auto-grade fields
  const [gradingMode, setGradingMode] = useState('manual');
  const [gradingType, setGradingType] = useState('individual'); // 'individual' | 'h2h'
  const [formulaKey, setFormulaKey] = useState('');
  const [formulaParamsText, setFormulaParamsText] = useState('');
  const [dataSource, setDataSource] = useState('major-mlb');
  const [autoGrading, setAutoGrading] = useState(false);
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
  // Per-side and core params for auto-grading formulas
  const [sideAComparator, setSideAComparator] = useState('gte');
  const [sideAThreshold, setSideAThreshold] = useState('');
  const [sideBComparator, setSideBComparator] = useState('lte');
  const [sideBThreshold, setSideBThreshold] = useState('');
  const [formulaTeamAbv, setFormulaTeamAbv] = useState('');
  const [formulaPlayerId, setFormulaPlayerId] = useState('');
  // Sample readout (preview)
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [previewData, setPreviewData] = useState(null);
  const [playersById, setPlayersById] = useState({});
  const [playersLoading, setPlayersLoading] = useState(false);
  const [playersError, setPlayersError] = useState('');
  const [gamePlayerIds, setGamePlayerIds] = useState([]);
  // Metrics for Stat O/U
  const [metricOptions, setMetricOptions] = useState([]);
  const [metricLoading, setMetricLoading] = useState(false);
  const [metricError, setMetricError] = useState('');
  // Multi metric selection state (for player_multi_stat_ou)
  const metricsSelected = useMemo(() => {
    try { const o = formulaParamsText && formulaParamsText.trim() ? JSON.parse(formulaParamsText) : {}; return Array.isArray(o.metrics) ? o.metrics : []; } catch { return []; }
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
  // H2H players and rules
  const [playerAId, setPlayerAId] = useState('');
  const [playerBId, setPlayerBId] = useState('');
  const [compareRule, setCompareRule] = useState('most');
  const [tieRule, setTieRule] = useState('push');
  const [teamAbvA, setTeamAbvA] = useState('');
  const [teamAbvB, setTeamAbvB] = useState('');
  // Tank linking helpers (inline on edit page)
  const [tankGames, setTankGames] = useState([]);
  const [tankLoading, setTankLoading] = useState(false);
  const [tankError, setTankError] = useState('');
  const [selectedTankId, setSelectedTankId] = useState('');
  const [linking, setLinking] = useState(false);
  const [tankHomeAbv, setTankHomeAbv] = useState('');
  const [tankAwayAbv, setTankAwayAbv] = useState('');

  // New state for team cover
  const [eventDetails, setEventDetails] = useState(null);
  const [teamCoverUrl, setTeamCoverUrl] = useState(null);

  // Event API Readout (Major MLB)
  const [showEventReadout, setShowEventReadout] = useState(false);
  const [eventReadoutLoading, setEventReadoutLoading] = useState(false);
  const [eventReadoutError, setEventReadoutError] = useState('');
  const [eventReadout, setEventReadout] = useState(null);
  const [autoGradeKey, setAutoGradeKey] = useState('');
  const [sideAMap, setSideAMap] = useState('');
  const [sideBMap, setSideBMap] = useState('');

  const formatDateTimeLocal = (iso) => {
    if (!iso) return '';
    try {
      const dt = new Date(iso);
      const pad = (n) => n.toString().padStart(2, '0');
      return `${dt.getFullYear()}-${pad(dt.getMonth()+1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
    } catch {
      return '';
    }
  };

  useEffect(() => {
    if (!propId) return;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const res = await fetch(`/api/admin/props/${propId}`);
        const data = await res.json();
        if (!data.success) throw new Error(data.error || 'Failed to load prop');
        const p = data.prop;
        setPropShort(p.propShort || '');
        setPropSummary(p.propSummary || '');
        setPropValueModel(p.propValueModel || 'vegas');
        setPropType(p.propType || 'moneyline');
        setPropStatus(p.propStatus || 'open');
        setPropSideAShort(p.PropSideAShort || '');
        setPropSideATake(p.PropSideATake || '');
        setPropSideAMoneyline(p.PropSideAMoneyline != null ? String(p.PropSideAMoneyline) : '');
        setPropSideBShort(p.PropSideBShort || '');
        setPropSideBTake(p.PropSideBTake || '');
        setPropSideBMoneyline(p.PropSideBMoneyline != null ? String(p.PropSideBMoneyline) : '');
        setTeams(Array.isArray(p.teams) ? p.teams : []);
        setPropOpenTime(formatDateTimeLocal(p.propOpenTime));
        setPropCloseTime(formatDateTimeLocal(p.propCloseTime));
        // Normalize stored cover source (Airtable may store lowercase values)
        (function normalizeCoverSource() {
          const raw = String(p.propCoverSource || 'event').toLowerCase();
          const normalized =
            raw === 'hometeam' ? 'homeTeam' :
            raw === 'awayteam' ? 'awayTeam' :
            raw === 'custom' ? 'custom' : 'event';
          setPropCoverSource(normalized);
        })();
        setEvent(p.event || null);
        setGradingMode(p.gradingMode || 'manual');
        setFormulaKey(p.formulaKey || '');
        setFormulaParamsText(p.formulaParams || '');
        // Initialize dataSource from params or event league
        try {
          const obj = p.formulaParams ? JSON.parse(p.formulaParams) : {};
          const leagueLc = String(p?.event?.eventLeague || '').toLowerCase();
          setDataSource(String(obj?.dataSource || (leagueLc === 'nfl' ? 'nfl' : 'major-mlb')));
        } catch {
          const leagueLc = String(p?.event?.eventLeague || '').toLowerCase();
          setDataSource(leagueLc === 'nfl' ? 'nfl' : 'major-mlb');
        }
        // Initialize simple Auto Grade UI state from persisted prop
        try {
          const mode = String(p.gradingMode || '').toLowerCase();
          const fk = String(p.formulaKey || '');
          setAutoGradeKey(mode === 'auto' ? fk : '');
          const obj = p.formulaParams ? JSON.parse(p.formulaParams) : {};
          const a = obj?.whoWins?.sideAMap;
          const b = obj?.whoWins?.sideBMap;
          if (a) setSideAMap(String(a));
          if (b) setSideBMap(String(b));
        } catch {}
        // Initialize gradingType and H2H states from params
        try {
          const obj = p.formulaParams ? JSON.parse(p.formulaParams) : {};
          const inferredH2H = obj && obj.playerAId && obj.playerBId;
          const persistedType = String(obj?.gradingType || '').toLowerCase();
          const typeToUse = persistedType === 'h2h' || persistedType === 'individual'
            ? persistedType
            : (inferredH2H ? 'h2h' : 'individual');
          setGradingType(typeToUse);
          if (obj && obj.playerAId) setPlayerAId(String(obj.playerAId));
          if (obj && obj.playerBId) setPlayerBId(String(obj.playerBId));
          setCompareRule(String(obj?.compareRule || 'most'));
          setTieRule(String(obj?.tieRule || 'push'));
          if (obj && obj.teamAbvA) setTeamAbvA(String(obj.teamAbvA).toUpperCase());
          if (obj && obj.teamAbvB) setTeamAbvB(String(obj.teamAbvB).toUpperCase());
        } catch {}
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [propId]);

  // Fetch full event details (with team links) when we have event from prop
  useEffect(() => {
    if (!event?.airtableId) return;
    (async () => {
      try {
        const res = await fetch(`/api/admin/events/${event.airtableId}`);
        const data = await res.json();
        if (data.success) setEventDetails(data.event);
      } catch (e) {
        console.error('Failed to fetch full event details', e);
      }
    })();
  }, [event?.airtableId]);

  // Compute team cover URL when appropriate
  useEffect(() => {
    if (!eventDetails) return;
    if (propCoverSource !== 'homeTeam' && propCoverSource !== 'awayTeam') {
      setTeamCoverUrl(null);
      return;
    }
    (async () => {
      try {
        const res = await fetch('/api/teams');
        const data = await res.json();
        if (!data.success) return;
        const options = data.teams.filter(t => t.teamType === eventDetails.eventLeague);
        const linkIds = propCoverSource === 'homeTeam' ? (eventDetails.homeTeamLink || []) : (eventDetails.awayTeamLink || []);
        const teamId = Array.isArray(linkIds) && linkIds.length ? linkIds[0] : null;
        if (!teamId) {
          setTeamCoverUrl(null);
          return;
        }
        const team = options.find(t => t.recordId === teamId);
        const url = team?.teamLogoURL || (Array.isArray(team?.teamLogo) && team.teamLogo[0]?.url) || null;
        setTeamCoverUrl(url);
      } catch (e) {
        console.error('Failed to compute team cover URL', e);
      }
    })();
  }, [eventDetails, propCoverSource]);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!propId) return;
    setSaving(true);
    setError(null);
    try {
      const payload = {
        propId,
        propStatus,
        propShort,
        propSummary,
        PropSideAShort,
        PropSideATake,
        PropSideAMoneyline,
        PropSideBShort,
        PropSideBTake,
        PropSideBMoneyline,
        propType,
        teams,
        propValueModel,
        propCloseTime,
        propCoverSource,
        gradingMode: autoGradeKey ? 'auto' : 'manual',
        formulaKey: autoGradeKey || undefined,
        formulaParams: formulaParamsText || undefined,
      };
      const res = await fetch('/api/props', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to save');
      // Go back to Admin Props list
      router.push('/admin/props');
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleAutoGradeNow = async () => {};

  // Generate AI Summary (reuse events create-prop flow)
  const handleGenerateSummary = async (context, model) => {
    if (!event?.airtableId) {
      setError('Missing eventId for summary generation');
      return;
    }
    setGeneratingSummary(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/generatePropSummary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId: event.airtableId, context, model }),
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

  // Sync local UI fields from formulaParamsText
  useEffect(() => {
    if (!formulaParamsText || !formulaParamsText.trim()) return;
    try {
      const obj = JSON.parse(formulaParamsText);
      if (obj && obj.sides) {
        if (obj.sides.A) {
          if (obj.sides.A.comparator) setSideAComparator(String(obj.sides.A.comparator));
          if (obj.sides.A.threshold != null) setSideAThreshold(String(obj.sides.A.threshold));
        }
        if (obj.sides.B) {
          if (obj.sides.B.comparator) setSideBComparator(String(obj.sides.B.comparator));
          if (obj.sides.B.threshold != null) setSideBThreshold(String(obj.sides.B.threshold));
        }
      }
      if (obj && obj.teamAbv) setFormulaTeamAbv(String(obj.teamAbv).toUpperCase());
      if (obj && obj.playerId) setFormulaPlayerId(String(obj.playerId));
    } catch {}
  }, [formulaParamsText]);

  const upsertSidesInParams = (newSides) => {
    try {
      const obj = formulaParamsText && formulaParamsText.trim() ? JSON.parse(formulaParamsText) : {};
      obj.sides = { ...(obj.sides || {}), ...newSides };
      setFormulaParamsText(JSON.stringify(obj, null, 2));
    } catch {
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

  // When grading type toggles, seed/remove appropriate params minimally
  useEffect(() => {
    if (gradingMode !== 'auto') return;
    if (gradingType === 'h2h') {
      if (playerAId) upsertRootParam('playerAId', String(playerAId));
      if (playerBId) upsertRootParam('playerBId', String(playerBId));
      upsertRootParam('compareRule', compareRule || 'most');
      upsertRootParam('tieRule', tieRule || 'push');
      if (teamAbvA) upsertRootParam('teamAbvA', String(teamAbvA));
      if (teamAbvB) upsertRootParam('teamAbvB', String(teamAbvB));
    } else {
      // ensure individual-required keys present if we have selections
      if (formulaTeamAbv) upsertRootParam('teamAbv', String(formulaTeamAbv));
      if (formulaPlayerId) upsertRootParam('playerId', String(formulaPlayerId));
    }
    // persist gradingType explicitly for robustness
    upsertRootParam('gradingType', gradingType);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gradingType]);

  // No remote formulas: using hardcoded list above

  // Use abbreviations directly from linked Event record (home/away)

  const computeGameDate = useMemo(() => {
    return (dateLike) => {
      try {
        const d = new Date(dateLike);
        const yr = d.getFullYear();
        const mo = String(d.getMonth() + 1).padStart(2, '0');
        const da = String(d.getDate()).padStart(2, '0');
        return `${yr}${mo}${da}`;
      } catch { return ''; }
    };
  }, []);

  const handleSelectFormula = (key) => {
    setFormulaKey(key);
    const f = formulas.find((x) => x.formulaKey === key);
    const defaults = (f && typeof f.defaultParams === 'object' && f.defaultParams) ? f.defaultParams : {};
    const dataSource = f?.dataSource || 'major-mlb';
    const league = (event?.eventLeague || '').toString().toLowerCase();
    const gameDate = event?.eventTime ? computeGameDate(event.eventTime) : '';
    const espnGameID = String(event?.espnGameID || '').trim();
    let merged = { dataSource, ...defaults, league, gameDate, ...(espnGameID ? { espnGameID } : {}) };
    try {
      if (key === 'mlb_player_strikeouts_ou') {
        merged = {
          ...merged,
          category: merged.category || 'Pitching',
          metric: merged.metric || 'SO',
          timeframe: merged.timeframe || 'game',
          sides: merged.sides || {
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


  const homeTeamName = Array.isArray(eventDetails?.homeTeam) ? (eventDetails?.homeTeam?.[0] || '') : (eventDetails?.homeTeam || '');
  const awayTeamName = Array.isArray(eventDetails?.awayTeam) ? (eventDetails?.awayTeam?.[0] || '') : (eventDetails?.awayTeam || '');

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
      // Use selected data source. For NFL, status endpoint requires year/week instead of gameDate.
      const src = dataSource || 'major-mlb';
      params.set('source', src);
      if (src === 'major-mlb') {
        if (gameDate) params.set('gameDate', gameDate);
      } else if (src === 'nfl') {
        // Derive likely NFL year/week is non-trivial; call without year/week and just show no scoreboard if unavailable.
        // We still pass no date filters; the endpoint needs year/week to return games.
      }
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
  useEffect(() => {
    if (autoGradeKey === 'who_wins') {
      if (!eventReadout && !eventReadoutLoading) fetchEventApiReadout();
      if (!sideAMap) setSideAMap('away');
      if (!sideBMap) setSideBMap('home');
    }
    if (autoGradeKey === 'stat_over_under') {
      // Ensure base params exist for grading
      try {
        if (event) {
          const gid = String(event?.espnGameID || '').trim();
          if (gid) upsertRootParam('espnGameID', gid);
          if (event?.eventTime) {
            const d = new Date(event.eventTime);
            const gameDate = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
            upsertRootParam('gameDate', gameDate);
          }
          // Lock entity to player for MVP
          upsertRootParam('entity', 'player');
        }
      } catch {}
      // Seed default sides if missing
      try {
        const obj = formulaParamsText && formulaParamsText.trim() ? JSON.parse(formulaParamsText) : {};
        if (!obj.sides) {
          obj.sides = { A: { comparator: 'gte', threshold: 1 }, B: { comparator: 'lte', threshold: 0 } };
          setFormulaParamsText(JSON.stringify(obj, null, 2));
        }
      } catch {}
    }
    if (autoGradeKey === 'player_multi_stat_ou') {
      // Ensure base params for multi-stat
      try {
        if (event) {
          const gid = String(event?.espnGameID || '').trim();
          if (gid) upsertRootParam('espnGameID', gid);
          if (event?.eventTime) {
            const d = new Date(event.eventTime);
            const gameDate = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
            upsertRootParam('gameDate', gameDate);
          }
          upsertRootParam('entity', 'player');
        }
      } catch {}
      // Ensure sides exist for multi-stat
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
    }
    if (autoGradeKey === 'team_stat_h2h') {
      try {
        if (event) {
          const gid = String(event?.espnGameID || '').trim();
          if (gid) upsertRootParam('espnGameID', gid);
          if (event?.eventTime) {
            const d = new Date(event.eventTime);
            const gameDate = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
            upsertRootParam('gameDate', gameDate);
          }
          upsertRootParam('entity', 'team');
        }
      } catch {}
      // Seed team abvs if missing
      try {
        const rawHome = event?.homeTeamAbbreviation;
        const rawAway = event?.awayTeamAbbreviation;
        const map = { CWS:'CHW', SDP:'SD', SFG:'SF', TBR:'TB', KCR:'KC', ARZ:'ARI', WSN:'WSH' };
        const norm = (v)=> map[String(v||'').toUpperCase()] || String(v||'').toUpperCase();
        const homeAbv = rawHome ? norm(rawHome) : '';
        const awayAbv = rawAway ? norm(rawAway) : '';
        const obj = formulaParamsText && formulaParamsText.trim() ? JSON.parse(formulaParamsText) : {};
        if (!obj.teamAbvA && awayAbv) obj.teamAbvA = awayAbv;
        if (!obj.teamAbvB && homeAbv) obj.teamAbvB = homeAbv;
        setFormulaParamsText(JSON.stringify(obj, null, 2));
      } catch {}
    }
  }, [autoGradeKey]);

  // Load metric keys for Stat O/U, Player H2H, Player Multi Stat O/U, and Team Stat H2H (from API tester boxscore normalized.statKeys)
  useEffect(() => {
    if (!(autoGradeKey === 'stat_over_under' || autoGradeKey === 'player_h2h' || autoGradeKey === 'player_multi_stat_ou' || autoGradeKey === 'team_stat_h2h' || autoGradeKey === 'team_stat_over_under')) return;
    const gid = String(event?.espnGameID || '').trim();
    if (!gid) return;
    setMetricLoading(true);
    setMetricError('');
    setMetricOptions([]);
    (async () => {
      try {
        const resp = await fetch(`/api/admin/api-tester/boxscore?source=${encodeURIComponent(dataSource || 'major-mlb')}&gameID=${encodeURIComponent(gid)}`);
        const json = await resp.json();
        if (resp.ok && json?.success) {
          let keys = Array.isArray(json?.normalized?.statKeys) ? json.normalized.statKeys : [];
          // For team H2H and team OU ensure classic team metrics are present
          if ((autoGradeKey === 'team_stat_h2h' || autoGradeKey === 'team_stat_over_under') && (dataSource || 'major-mlb') === 'major-mlb') {
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
  }, [autoGradeKey, event?.espnGameID, dataSource]);
  // For Team Stat H2H, we use team-level scoreboard metrics (R, H, E)
  useEffect(() => {
    if (autoGradeKey !== 'team_stat_h2h') return;
    setMetricOptions(['R', 'H', 'E']);
    setMetricError('');
    setMetricLoading(false);
  }, [autoGradeKey]);
  // Ensure base params for Team Single Stat O/U and seed defaults
  useEffect(() => {
    if (autoGradeKey !== 'team_stat_over_under') return;
    try {
      if (event) {
        const gid = String(event?.espnGameID || '').trim();
        if (gid) upsertRootParam('espnGameID', gid);
        if (event?.eventTime) {
          const d = new Date(event.eventTime);
          const gameDate = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
          upsertRootParam('gameDate', gameDate);
        }
        upsertRootParam('entity', 'team');
      }
    } catch {}
    // Seed team abv and sides if missing
    try {
      const rawHome = event?.homeTeamAbbreviation;
      const rawAway = event?.awayTeamAbbreviation;
      const map = { CWS:'CHW', SDP:'SD', SFG:'SF', TBR:'TB', KCR:'KC', ARZ:'ARI', WSN:'WSH' };
      const norm = (v)=> map[String(v||'').toUpperCase()] || String(v||'').toUpperCase();
      const awayAbv = rawAway ? norm(rawAway) : '';
      const obj = formulaParamsText && formulaParamsText.trim() ? JSON.parse(formulaParamsText) : {};
      if (!obj.teamAbv && awayAbv) obj.teamAbv = awayAbv;
      if (!obj.sides) obj.sides = { A: { comparator: 'gte', threshold: 1 }, B: { comparator: 'lte', threshold: 0 } };
      setFormulaParamsText(JSON.stringify(obj, null, 2));
    } catch {}
  }, [autoGradeKey, event?.espnGameID, event?.eventTime, event?.homeTeamAbbreviation, event?.awayTeamAbbreviation]);

  // Bootstrap: load players at page load when ESPN ID is available (so lists are ready for any formula)
  useEffect(() => {
    const espnId = String(event?.espnGameID || '').trim();
    if (!espnId) return;
    if (Object.keys(playersById || {}).length) return;
    const rawHome = eventDetails?.homeTeamAbbreviation || event?.homeTeamAbbreviation;
    const rawAway = eventDetails?.awayTeamAbbreviation || event?.awayTeamAbbreviation;
    const norm = (v) => {
      const map = { CWS:'CHW', SDP:'SD', SFG:'SF', TBR:'TB', KCR:'KC', ARZ:'ARI', WSN:'WSH' };
      const s = String(v || '').toUpperCase();
      return map[s] || s;
    };
    const abvs = Array.from(new Set([norm(rawHome), norm(rawAway)].filter(Boolean)));
    setPlayersLoading(true);
    setPlayersError('');
    (async () => {
      try {
        const box = await fetch(`/api/admin/api-tester/boxscore?source=${encodeURIComponent(dataSource || 'major-mlb')}&gameID=${encodeURIComponent(espnId)}`);
        const boxJson = await box.json();
        let map = (box.ok && boxJson?.normalized?.playersById) ? boxJson.normalized.playersById : {};
        if (!Object.keys(map || {}).length && abvs.length) {
          try {
            const roster = await fetch(`/api/admin/api-tester/players?teamAbv=${encodeURIComponent(abvs.join(','))}`);
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
  }, [event?.espnGameID, event?.homeTeamAbbreviation, event?.awayTeamAbbreviation, eventDetails?.homeTeamAbbreviation, eventDetails?.awayTeamAbbreviation]);

  // Load players for Stat O/U and Player H2H from MLB boxscore; roster fallback if needed
  useEffect(() => {
    if (!(autoGradeKey === 'stat_over_under' || autoGradeKey === 'player_h2h')) return;
    const espnId = String(event?.espnGameID || '').trim();
    if (!espnId) return;
    const rawHome = eventDetails?.homeTeamAbbreviation || event?.homeTeamAbbreviation;
    const rawAway = eventDetails?.awayTeamAbbreviation || event?.awayTeamAbbreviation;
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
        // 1) Try boxscore to get normalized players map
        const box = await fetch(`/api/admin/api-tester/boxscore?source=${encodeURIComponent(dataSource || 'major-mlb')}&gameID=${encodeURIComponent(espnId)}`);
        const boxJson = await box.json();
        let map = (box.ok && boxJson?.normalized?.playersById) ? boxJson.normalized.playersById : {};
        // 2) Fallback to roster by team if boxscore map is empty
        if (!Object.keys(map || {}).length && abvs.length) {
          try {
            const roster = await fetch(`/api/admin/api-tester/players?teamAbv=${encodeURIComponent(abvs.join(','))}`);
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
  }, [autoGradeKey, event?.espnGameID, event?.homeTeamAbbreviation, event?.awayTeamAbbreviation, eventDetails?.homeTeamAbbreviation, eventDetails?.awayTeamAbbreviation]);
  useEffect(() => {
    if (autoGradeKey !== 'who_wins') return;
    try {
      const obj = formulaParamsText && formulaParamsText.trim() ? JSON.parse(formulaParamsText) : {};
      obj.whoWins = { sideAMap: sideAMap || '', sideBMap: sideBMap || '' };
      setFormulaParamsText(JSON.stringify(obj, null, 2));
    } catch {}
  }, [autoGradeKey, sideAMap, sideBMap]);
  useEffect(() => {
    if (autoGradeKey !== 'who_wins') return;
    if (!event) return;
    try {
      const gid = String(event?.espnGameID || '').trim();
      if (gid) {
        const obj = formulaParamsText && formulaParamsText.trim() ? JSON.parse(formulaParamsText) : {};
        obj.espnGameID = gid;
        setFormulaParamsText(JSON.stringify(obj, null, 2));
      }
    } catch {}
    try {
      if (event?.eventTime) {
        const d = new Date(event.eventTime);
        const gameDate = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
        const obj = formulaParamsText && formulaParamsText.trim() ? JSON.parse(formulaParamsText) : {};
        obj.gameDate = gameDate;
        setFormulaParamsText(JSON.stringify(obj, null, 2));
      }
    } catch {}
    try {
      const rawHome = event?.homeTeamAbbreviation;
      const rawAway = event?.awayTeamAbbreviation;
      const normalizeAbv = (val) => {
        const v = String(val || '').toUpperCase();
        const map = { CWS:'CHW', SDP:'SD', SFG:'SF', TBR:'TB', KCR:'KC', ARZ:'ARI', WSN:'WSH' };
        return map[v] || v;
      };
      const homeAbv = rawHome ? normalizeAbv(rawHome) : '';
      const awayAbv = rawAway ? normalizeAbv(rawAway) : '';
      if (homeAbv || awayAbv) {
        const obj = formulaParamsText && formulaParamsText.trim() ? JSON.parse(formulaParamsText) : {};
        obj.teams = { homeAbv, awayAbv };
        setFormulaParamsText(JSON.stringify(obj, null, 2));
      }
    } catch {}
  }, [autoGradeKey, event?.espnGameID, event?.eventTime, event?.homeTeamAbbreviation, event?.awayTeamAbbreviation]);

  return (
    <div className="p-4 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Edit Prop</h1>
      {event && (
        <>
        {/* consolidated below */}
        <div className="mb-4 p-3 bg-gray-50 rounded border">
          <div className="text-sm font-medium text-gray-700">What event is this prop linked to?</div>
          <div className="mt-1 flex items-center gap-2">
            <div className="text-sm text-gray-700">{event?.eventTitle || 'No event linked'}</div>
            <EventSelector
              selectedEvent={event}
              onSelect={(evt) => {
                const evtId = evt?.airtableId || evt?.id || null;
                if (!evtId || typeof evtId !== 'string' || !evtId.startsWith('rec')) return;
                (async () => {
                  try {
                    const res = await fetch('/api/props', {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ propId, eventId: evtId }),
                    });
                    const data = await res.json();
                    if (res.ok && data.success) {
                      setEvent({ airtableId: evtId, eventTitle: evt.eventTitle, eventTime: evt.eventTime, eventLeague: evt.eventLeague });
                    } else {
                      setError(data.error || 'Failed to link event');
                    }
                  } catch (e) {
                    setError(e.message || 'Failed to link event');
                  }
                })();
              }}
              league={event?.eventLeague || ''}
            />
          </div>
          <div className="mt-2 text-sm">
            {(() => {
              const league = String(event?.eventLeague || propType || '').toLowerCase();
              const gid = String(event?.espnGameID || '').trim();
              if (!gid) return (<div className="text-gray-700">No ESPN event linked</div>);
              const url = `https://www.espn.com/${league}/game/_/gameId/${gid}`;
              return (
                <a href={url} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">
                  View on ESPN (gameId {gid})
                </a>
              );
            })()}
          </div>
        </div>
        {/* Event API Readout */}
        <div className="mb-4 p-3 bg-white rounded border">
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
        {/* Auto Grade Type (Formulas) */}
        <div className="mb-4 p-3 bg-white rounded border">
          <div className="text-lg font-semibold">Auto Grade</div>
          <label className="block text-sm font-medium text-gray-700 mt-2">Auto Grade Source</label>
          <select
            className="mt-1 block w-full border rounded px-2 py-1"
            value={dataSource}
            onChange={(e) => {
              const v = e.target.value;
              setDataSource(v);
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
                    <option value="away">{Array.isArray(eventDetails?.awayTeam) ? (eventDetails?.awayTeam[0] || '') : (eventDetails?.awayTeam || eventReadout?.away || 'Away')}</option>
                    <option value="home">{Array.isArray(eventDetails?.homeTeam) ? (eventDetails?.homeTeam[0] || '') : (eventDetails?.homeTeam || eventReadout?.home || 'Home')}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm">Take B Team</label>
                  <select className="mt-1 block w-full border rounded px-2 py-1" value={sideBMap} onChange={(e) => setSideBMap(e.target.value)}>
                    <option value="home">{Array.isArray(eventDetails?.homeTeam) ? (eventDetails?.homeTeam[0] || '') : (eventDetails?.homeTeam || eventReadout?.home || 'Home')}</option>
                    <option value="away">{Array.isArray(eventDetails?.awayTeam) ? (eventDetails?.awayTeam[0] || '') : (eventDetails?.awayTeam || eventReadout?.away || 'Away')}</option>
                  </select>
                </div>
              </div>
              {eventReadout && (
                <div className="mt-2 p-2 bg-gray-50 rounded border text-sm">
                  <div className="font-medium mb-1">Runs preview</div>
                  <div>Home ({Array.isArray(eventDetails?.homeTeam) ? (eventDetails?.homeTeam[0] || '') : (eventDetails?.homeTeam || eventReadout?.home)}): {eventReadout?.lineScore?.home?.R ?? '–'}</div>
                  <div>Away ({Array.isArray(eventDetails?.awayTeam) ? (eventDetails?.awayTeam[0] || '') : (eventDetails?.awayTeam || eventReadout?.away)}): {eventReadout?.lineScore?.away?.R ?? '–'}</div>
                  <div className="text-xs text-gray-600 mt-1">Used to determine winner when Final.</div>
                </div>
              )}
              {!eventReadout && !eventReadoutLoading && (
                <button type="button" onClick={fetchEventApiReadout} className="text-sm text-blue-600 underline">Check event connection</button>
              )}
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
                    value={(function(){ try { const o=JSON.parse(formulaParamsText||'{}'); return o.teamAbvA||''; } catch { return ''; } })()}
                    onChange={(e)=>{ try { const o = formulaParamsText && formulaParamsText.trim() ? JSON.parse(formulaParamsText) : {}; o.teamAbvA = e.target.value; setFormulaParamsText(JSON.stringify(o, null, 2)); } catch {} }}
                  >
                    <option value="">Select team…</option>
                    {(()=>{ try {
                      const rawHome = eventDetails?.homeTeamAbbreviation || event?.homeTeamAbbreviation;
                      const rawAway = eventDetails?.awayTeamAbbreviation || event?.awayTeamAbbreviation;
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
                    value={(function(){ try { const o=JSON.parse(formulaParamsText||'{}'); return o.teamAbvB||''; } catch { return ''; } })()}
                    onChange={(e)=>{ try { const o = formulaParamsText && formulaParamsText.trim() ? JSON.parse(formulaParamsText) : {}; o.teamAbvB = e.target.value; setFormulaParamsText(JSON.stringify(o, null, 2)); } catch {} }}
                  >
                    <option value="">Select team…</option>
                    {(()=>{ try {
                      const rawHome = eventDetails?.homeTeamAbbreviation || event?.homeTeamAbbreviation;
                      const rawAway = eventDetails?.awayTeamAbbreviation || event?.awayTeamAbbreviation;
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
                    value={(function(){ try { const o=JSON.parse(formulaParamsText||'{}'); return o.compareRule||'most'; } catch { return 'most'; } })()}
                    onChange={(e) => { try { const o = formulaParamsText && formulaParamsText.trim() ? JSON.parse(formulaParamsText) : {}; o.compareRule = e.target.value; setFormulaParamsText(JSON.stringify(o, null, 2)); } catch {} }}
                    className="mt-1 block w-full border rounded px-2 py-1"
                  >
                    <option value="most">Most</option>
                    <option value="least">Least</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Tie Rule</label>
                  <select
                    value={(function(){ try { const o=JSON.parse(formulaParamsText||'{}'); return o.tieRule||'push'; } catch { return 'push'; } })()}
                    onChange={(e) => { try { const o = formulaParamsText && formulaParamsText.trim() ? JSON.parse(formulaParamsText) : {}; o.tieRule = e.target.value; setFormulaParamsText(JSON.stringify(o, null, 2)); } catch {} }}
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
          {(autoGradeKey === 'stat_over_under') && (
            <div className="mt-3 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Metric</label>
                  {metricLoading ? (
                    <div className="mt-1 text-xs text-gray-600">Loading metrics…</div>
                  ) : (
                    <select
                      className="mt-1 block w-full border rounded px-2 py-1"
                      value={(function(){ try { const o=JSON.parse(formulaParamsText||'{}'); return o.metric||''; } catch { return ''; } })()}
                      onChange={(e)=> upsertRootParam('metric', e.target.value)}
                      disabled={!metricOptions || metricOptions.length === 0}
                    >
                      {(!metricOptions || metricOptions.length === 0) ? (
                        <option value="">No metrics available</option>
                      ) : (
                        <>
                          <option value="">Select a metric…</option>
                          {metricOptions.map((k) => (
                            <option key={k} value={k}>{k}</option>
                          ))}
                        </>
                      )}
                    </select>
                  )}
                  {!!metricError && <div className="mt-1 text-xs text-red-600">{metricError}</div>}
                </div>
                <div />
              </div>
              {/* Team or Player selectors */}
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
                      const rawHome = eventDetails?.homeTeamAbbreviation || event?.homeTeamAbbreviation;
                      const rawAway = eventDetails?.awayTeamAbbreviation || event?.awayTeamAbbreviation;
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
              {/* Per-side thresholds */}
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
                      const rawHome = eventDetails?.homeTeamAbbreviation || event?.homeTeamAbbreviation;
                      const rawAway = eventDetails?.awayTeamAbbreviation || event?.awayTeamAbbreviation;
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
          {autoGradeKey === 'player_multi_stat_ou' && (
            <div className="mt-3 space-y-3">
              {/* Metric multi-select (add from dropdown) */}
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
                {/* Chips */}
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
              {/* Team + Player selection */}
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
                      const rawHome = eventDetails?.homeTeamAbbreviation || event?.homeTeamAbbreviation;
                      const rawAway = eventDetails?.awayTeamAbbreviation || event?.awayTeamAbbreviation;
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
              {/* Per-side thresholds (same as single stat) */}
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
              {/* Metric + Winner selection */}
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
              {/* Side A: player */}
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
                      const rawHome = eventDetails?.homeTeamAbbreviation || event?.homeTeamAbbreviation;
                      const rawAway = eventDetails?.awayTeamAbbreviation || event?.awayTeamAbbreviation;
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

              {/* Side B: player */}
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
                      const rawHome = eventDetails?.homeTeamAbbreviation || event?.homeTeamAbbreviation;
                      const rawAway = eventDetails?.awayTeamAbbreviation || event?.awayTeamAbbreviation;
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
            </div>
          )}
        </div>
        {/* Auto Grade (MVP) + Sample Readout */}
        <div className="mb-4 p-3 bg-white rounded border">
          <div className="text-lg font-semibold">Auto Grade (MVP)</div>
          <p className="text-sm text-gray-600 mt-1">Preview the data sources we'll consult to grade this prop.</p>
          <div className="mt-3 text-sm">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <div>
                <div className="font-medium">Derived</div>
                <div className="text-gray-700">ESPN GameID: {String(event?.espnGameID || '') || '–'}</div>
                <div className="text-gray-700">Source: <span className="font-mono">{dataSource}</span></div>
              </div>
              <div>
                <div className="font-medium">Sample Readout</div>
                {(!event?.espnGameID) && <div className="text-gray-600">Link an event to show preview.</div>}
                {event?.espnGameID && previewLoading && <div className="text-gray-600">Loading preview…</div>}
                {event?.espnGameID && !!previewError && <div className="text-red-600">{previewError}</div>}
                {event?.espnGameID && !previewLoading && !previewError && previewData && (
                  <div className="space-y-1">
                    {previewData.scoreboard && (
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
                    )}
                    <div>
                      <span className="text-gray-600">Players:</span> {Object.keys(previewData.normalized?.playersById || {}).length}
                    </div>
                    <div className="truncate">
                      <span className="text-gray-600">Stat Keys:</span> {(previewData.normalized?.statKeys || []).slice(0, 8).join(', ') || '—'}{(previewData.normalized?.statKeys || []).length > 8 ? '…' : ''}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        <div className="border rounded p-3 hidden">
          <div className="flex items-center gap-3">
            <input id="autoGrade" type="checkbox" checked={gradingMode === 'auto'} onChange={(e) => setGradingMode(e.target.checked ? 'auto' : 'manual')} />
            <label htmlFor="autoGrade" className="text-sm font-medium text-gray-700">Auto grade</label>
          </div>
          {false && (
            <div className="mt-3 space-y-2">
              <div>
                <label className="block text-sm font-medium text-gray-700">Grading Type</label>
                <select
                  value={gradingType}
                  onChange={(e) => setGradingType(e.target.value)}
                  className="mt-1 block w-full border rounded px-2 py-1"
                >
                  <option value="individual">Individual (single player)</option>
                  <option value="h2h">Head-to-Head (two players)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Formula</label>
                <select
                  value={formulaKey}
                  onChange={(e) => handleSelectFormula(e.target.value)}
                  className="mt-1 block w-full border rounded px-2 py-1"
                >
                  <option value="">Select a formula…</option>
                  {formulas.map((f) => (
                    <option key={f.formulaKey} value={f.formulaKey}>{f.displayName || f.formulaKey}</option>
                  ))}
                </select>
              </div>
              {/* Individual mode core params */}
              {gradingType === 'individual' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Team Abv (filter)</label>
                    <select
                      value={formulaTeamAbv}
                      onChange={(e) => { const v = e.target.value; setFormulaTeamAbv(v); upsertRootParam('teamAbv', v); }}
                      className="mt-1 block w-full border rounded px-2 py-1"
                    >
                      <option value="">All teams…</option>
                      {Array.from(new Set(
                        Object.entries(playersById)
                          .filter(([id]) => gamePlayerIds.includes(String(id)))
                          .map(([, p]) => String(p.teamAbv || '').toUpperCase())
                          .filter(Boolean)
                      )).map((abv) => (
                        <option key={abv} value={abv}>{abv}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Player ID</label>
                    {playersLoading && (
                      <div className="mt-1 text-xs text-gray-600">Loading players…</div>
                    )}
                    {!!playersError && (
                      <div className="mt-1 text-xs text-red-600">{playersError}</div>
                    )}
                    {!playersLoading && Object.keys(playersById || {}).length > 0 && gamePlayerIds.length > 0 ? (
                      <select
                        value={formulaPlayerId}
                        onChange={(e) => { const v = e.target.value; setFormulaPlayerId(v); upsertRootParam('playerId', v); }}
                        className="mt-1 block w-full border rounded px-2 py-1"
                      >
                        <option value="">Select a player…</option>
                        {Object.entries(playersById)
                          .filter(([id, p]) => {
                            if (!gamePlayerIds.includes(String(id))) return false;
                            if (!formulaTeamAbv) return true;
                            return String(p.teamAbv || '').toUpperCase() === String(formulaTeamAbv).toUpperCase();
                          })
                          .sort(([, a], [, b]) => String(a.longName || a.id).localeCompare(String(b.longName || b.id)))
                          .map(([id, p]) => (
                            <option key={id} value={id}>{p.longName || id} ({p.teamAbv || formulaTeamAbv})</option>
                          ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={formulaPlayerId}
                        onChange={(e) => { const v = e.target.value.trim(); setFormulaPlayerId(v); upsertRootParam('playerId', v); }}
                        className="mt-1 block w-full border rounded px-2 py-1"
                        placeholder="Link Tank game or wait for players…"
                      />
                    )}
                  </div>
                </div>
              )}

              {/* H2H mode params */}
              {gradingType === 'h2h' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Team A (filter)</label>
                      <select
                        value={teamAbvA}
                        onChange={(e) => { const v = e.target.value; setTeamAbvA(v); upsertRootParam('teamAbvA', v); }}
                        className="mt-1 block w-full border rounded px-2 py-1"
                      >
                        <option value="">All teams…</option>
                        {Array.from(new Set(
                          Object.entries(playersById)
                            .filter(([id]) => gamePlayerIds.includes(String(id)))
                            .map(([, p]) => String(p.teamAbv || '').toUpperCase())
                            .filter(Boolean)
                        )).map((abv) => (
                          <option key={abv} value={abv}>{abv}</option>
                        ))}
                      </select>
                      <label className="block text-sm font-medium text-gray-700">Player A (Side A)</label>
                      <select
                        value={playerAId}
                        onChange={(e) => { const v = e.target.value; setPlayerAId(v); upsertRootParam('playerAId', v); }}
                        className="mt-1 block w-full border rounded px-2 py-1"
                      >
                        <option value="">Select player A…</option>
                        {Object.entries(playersById)
                          .filter(([id, p]) => {
                            if (!gamePlayerIds.includes(String(id))) return false;
                            if (!teamAbvA) return true;
                            return String(p.teamAbv || '').toUpperCase() === String(teamAbvA).toUpperCase();
                          })
                          .sort(([, a], [, b]) => String(a.longName || a.id).localeCompare(String(b.longName || b.id)))
                          .map(([id, p]) => (
                            <option key={id} value={id}>{p.longName || id} ({p.teamAbv || ''})</option>
                          ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Team B (filter)</label>
                      <select
                        value={teamAbvB}
                        onChange={(e) => { const v = e.target.value; setTeamAbvB(v); upsertRootParam('teamAbvB', v); }}
                        className="mt-1 block w-full border rounded px-2 py-1"
                      >
                        <option value="">All teams…</option>
                        {Array.from(new Set(
                          Object.entries(playersById)
                            .filter(([id]) => gamePlayerIds.includes(String(id)))
                            .map(([, p]) => String(p.teamAbv || '').toUpperCase())
                            .filter(Boolean)
                        )).map((abv) => (
                          <option key={abv} value={abv}>{abv}</option>
                        ))}
                      </select>
                      <label className="block text-sm font-medium text-gray-700">Player B (Side B)</label>
                      <select
                        value={playerBId}
                        onChange={(e) => { const v = e.target.value; setPlayerBId(v); upsertRootParam('playerBId', v); }}
                        className="mt-1 block w-full border rounded px-2 py-1"
                      >
                        <option value="">Select player B…</option>
                        {Object.entries(playersById)
                          .filter(([id, p]) => {
                            if (!gamePlayerIds.includes(String(id))) return false;
                            if (!teamAbvB) return true;
                            return String(p.teamAbv || '').toUpperCase() === String(teamAbvB).toUpperCase();
                          })
                          .sort(([, a], [, b]) => String(a.longName || a.id).localeCompare(String(b.longName || b.id)))
                          .map(([id, p]) => (
                            <option key={id} value={id}>{p.longName || id} ({p.teamAbv || ''})</option>
                          ))}
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
              {/* per-side inputs (Individual only) */}
              {gradingType === 'individual' && (
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
                          <option value="gt">Greater than</option>
                          <option value="gte">Equal or more than</option>
                          <option value="eq">Equal to</option>
                          <option value="lte">Equal or less than</option>
                          <option value="lt">Less than</option>
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
                          <option value="gt">Greater than</option>
                          <option value="gte">Equal or more than</option>
                          <option value="eq">Equal to</option>
                          <option value="lte">Equal or less than</option>
                          <option value="lt">Less than</option>
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
                  <p className="text-xs text-gray-500 mt-2">These rules are saved into formula params under sides.A and sides.B.</p>
                </div>
              )}
              <div>
                <div className="flex items-center justify-between">
                  <label className="block text-sm font-medium text-gray-700">Formula Params (JSON)</label>
                  <button type="button" className="text-xs text-blue-600" onClick={() => handleSelectFormula(formulaKey)} disabled={!formulaKey}>Reset params</button>
                </div>
              </div>
              <div>
                <textarea rows={6} className="mt-1 block w-full border rounded px-2 py-1 font-mono text-xs" value={formulaParamsText} onChange={(e) => setFormulaParamsText(e.target.value)} placeholder='{"teamAbv":"PIT","playerId":"694973","category":"Pitching","metric":"SO","timeframe":"game","sides":{"A":{"comparator":"gte","threshold":6},"B":{"comparator":"lte","threshold":5}}}' />
              </div>
              {/* Auto grade button removed; primary CTA is Save */}
            </div>
          )}
        </div>
        </>
      )}
      <form onSubmit={handleSave} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">Short Label</label>
          <input className="mt-1 block w-full border rounded px-2 py-1" value={propShort} onChange={(e) => setPropShort(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Value Model</label>
          <select className="mt-1 block w-full border rounded px-2 py-1" value={propValueModel} onChange={(e) => setPropValueModel(e.target.value)}>
            <option value="vegas">Vegas</option>
            <option value="popular">Popular</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Summary</label>
          <textarea className="mt-1 block w-full border rounded px-2 py-1" value={propSummary} onChange={(e) => setPropSummary(e.target.value)} />
          <button
            type="button"
            onClick={() => {
              const eventDateTime = event?.eventTime ? new Date(event.eventTime).toLocaleString() : 'the scheduled time';
              const defaultPrompt = `Search the web for the latest news and statistics around ${event?.eventTitle || 'this event'} on ${eventDateTime}. Write this in long paragraph format filled with stats and narratives.`;
              const serverPrompt = `Write a 30 words max summary previewing ${event?.eventTitle || 'the upcoming game'} on ${eventDateTime} in the ${event?.eventLeague || ''}, use relevant narratives and stats.`;
              openModal('aiSummaryContext', {
                defaultPrompt,
                serverPrompt,
                defaultModel: process.env.NEXT_PUBLIC_OPENAI_DEFAULT_MODEL || 'gpt-4.1',
                onGenerate: handleGenerateSummary,
                onUse: (text) => setPropSummary(text),
              });
            }}
            disabled={generatingSummary || !event}
            className={`mt-2 text-sm ${generatingSummary ? 'bg-gray-400' : 'bg-indigo-600 hover:bg-indigo-700'} text-white rounded px-3 py-1`}
          >
            {generatingSummary ? 'Generating…' : 'Generate AI Summary'}
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <h3 className="font-semibold">Side A</h3>
            <label className="block text-sm">Label</label>
            <input className="mt-1 block w-full border rounded px-2 py-1" value={PropSideAShort} onChange={(e) => setPropSideAShort(e.target.value)} />
            <label className="block text-sm mt-2">Take</label>
            <input className="mt-1 block w-full border rounded px-2 py-1" value={PropSideATake} onChange={(e) => setPropSideATake(e.target.value)} />
            {propValueModel === 'vegas' && (
              <>
                <label className="block text-sm mt-2">Moneyline</label>
                <input type="number" className="mt-1 block w-full border rounded px-2 py-1" value={PropSideAMoneyline} onChange={(e) => setPropSideAMoneyline(e.target.value)} />
                <label className="block text-sm mt-2">Value A</label>
                <input type="number" className="mt-1 block w-full border rounded px-2 py-1" value={computedValueA} readOnly />
              </>
            )}
          </div>
          <div>
            <h3 className="font-semibold">Side B</h3>
            <label className="block text-sm">Label</label>
            <input className="mt-1 block w-full border rounded px-2 py-1" value={PropSideBShort} onChange={(e) => setPropSideBShort(e.target.value)} />
            <label className="block text-sm mt-2">Take</label>
            <input className="mt-1 block w-full border rounded px-2 py-1" value={PropSideBTake} onChange={(e) => setPropSideBTake(e.target.value)} />
            {propValueModel === 'vegas' && (
              <>
                <label className="block text-sm mt-2">Moneyline</label>
                <input type="number" className="mt-1 block w-full border rounded px-2 py-1" value={PropSideBMoneyline} onChange={(e) => setPropSideBMoneyline(e.target.value)} />
                <label className="block text-sm mt-2">Value B</label>
                <input type="number" className="mt-1 block w-full border rounded px-2 py-1" value={computedValueB} readOnly />
              </>
            )}
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Open Time</label>
            <input type="datetime-local" className="mt-1 block w-full border rounded px-2 py-1" value={propOpenTime} onChange={(e) => setPropOpenTime(e.target.value)} disabled />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Close Time</label>
            <input type="datetime-local" className="mt-1 block w-full border rounded px-2 py-1" value={propCloseTime} onChange={(e) => setPropCloseTime(e.target.value)} />
            <div className="mt-1">
              <button
                type="button"
                disabled={!event?.eventTime}
                onClick={() => setPropCloseTime(formatDateTimeLocal(event.eventTime))}
                className={`text-sm px-3 py-1 rounded ${event?.eventTime ? 'bg-gray-200 text-gray-800 hover:bg-gray-300' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}
              >
                When event starts
              </button>
            </div>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Cover Source</label>
          <select className="mt-1 block w-full border rounded px-2 py-1" value={propCoverSource} onChange={(e) => setPropCoverSource(e.target.value)}>
            <option value="event">Event</option>
            <option value="homeTeam" disabled={!eventDetails}>{homeTeamName ? `${homeTeamName} (Home)` : 'Home Team'}</option>
            <option value="awayTeam" disabled={!eventDetails}>{awayTeamName ? `${awayTeamName} (Away)` : 'Away Team'}</option>
            <option value="custom">Custom</option>
          </select>
        </div>
        {(propCoverSource === 'homeTeam' || propCoverSource === 'awayTeam') && teamCoverUrl && (
          <div>
            <label className="block text-sm font-medium text-gray-700">Team Logo Preview</label>
            <img src={teamCoverUrl} alt="Team Logo" className="mt-2 h-32 object-contain" />
          </div>
        )}
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <div className="flex gap-2">
          <button type="submit" disabled={saving} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">{saving ? 'Saving…' : 'Save'}</button>
          <button type="button" onClick={() => router.back()} className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700">Cancel</button>
        </div>
      </form>
    </div>
  );
}


