import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { useModal } from '../../../contexts/ModalContext';

export default function EditPropPage() {
  const router = useRouter();
  const { propId } = router.query;
  const { openModal } = useModal();

  // Open shared AddEventModal to link/change the event for this prop
  const openLinkEventModal = () => {
    try {
      console.log('🔗 [EditProp] Open Link Event Modal', {
        propId,
        currentEvent: event ? {
          id: event?.airtableId || event?.id || null,
          title: event?.eventTitle || null,
          league: event?.eventLeague || null,
          espnGameID: event?.espnGameID || null,
          time: event?.eventTime || null,
        } : null,
        propType,
      });
    } catch {}
    openModal('addEvent', {
      allowMultiSelect: false,
      initialLeague: event?.eventLeague || propType || '',
      initialDate: (() => {
        try {
          if (!event?.eventTime) return '';
          const d = new Date(event.eventTime);
          const tzOffsetMs = d.getTimezoneOffset() * 60000;
          return new Date(d.getTime() - tzOffsetMs).toISOString().slice(0, 10);
        } catch {
          return '';
        }
        // Keep local custom cover URL in sync when editing an existing prop
        try {
          if (p?.propCoverSource && String(p.propCoverSource).toLowerCase() === 'custom') {
            const coverFromParams = (() => {
              try { const obj = p.formulaParams ? JSON.parse(p.formulaParams) : {}; return obj?.propCover || null; } catch { return null; }
            })();
            setCustomCoverUrl(coverFromParams || '');
          } else if (p?.event && Array.isArray(p.event?.eventCover) && p.event.eventCover[0]?.url) {
            setCustomCoverUrl('');
          }
        } catch {}
      })(),
      onEventSelected: async (sel) => {
        try {
          console.log('🆕 [EditProp] Event selected from modal', { raw: sel });
          const chosen = Array.isArray(sel) ? (sel[0] || null) : sel;
          const evtId = chosen?.id || chosen?.airtableId || null;
          if (!evtId) {
            console.error('🚫 [EditProp] Invalid event selection', { chosen });
            setError('Invalid event selection');
            return;
          }
          const res = await fetch('/api/props', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ propId, eventId: evtId }),
          });
          try { console.log('📨 [EditProp] Link event -> PATCH /api/props response', { ok: res.ok, status: res.status }); } catch {}
          const data = await res.json();
          if (!res.ok || !data.success) throw new Error(data.error || 'Failed to link event');
          const evRes = await fetch(`/api/admin/events/${encodeURIComponent(evtId)}`);
          const evJson = await evRes.json();
          const ev = (evRes.ok && evJson?.success) ? evJson.event : null;
          try { console.log('📥 [EditProp] Loaded linked event details', { success: !!ev, id: evtId, event: ev || null }); } catch {}
          setEvent(ev || { airtableId: evtId, eventTitle: chosen.eventTitle, eventTime: chosen.eventTime, eventLeague: chosen.eventLeague });
          setEventReadout(null);
          setShowEventReadout(true);
          if (!eventReadoutLoading) fetchEventApiReadout(ev || { airtableId: evtId, eventTitle: chosen.eventTitle, eventTime: chosen.eventTime, eventLeague: chosen.eventLeague });
          try { console.log('✅ [EditProp] Event linked to prop', { propId, eventId: evtId }); } catch {}
        } catch (e) {
          try { console.error('❌ [EditProp] Failed to link event', { propId, error: e?.message }); } catch {}
          setError(e.message || 'Failed to link event');
        }
      },
    });
  };

  const handleUnlinkEvent = async () => {
    try {
      try { console.log('🧹 [EditProp] Attempt unlink event', { propId, currentEventId: event?.airtableId || event?.id || null }); } catch {}
      const res = await fetch('/api/props', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          propId,
          eventId: null,
          // Defensive: also clear grading on server if supported
          gradingMode: 'manual',
          formulaKey: '',
          formulaParams: ''
        }),
      });
      try { console.log('🗑️ [EditProp] Unlink event -> PATCH /api/props response', { ok: res.ok, status: res.status }); } catch {}
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || 'Failed to remove linked event');
      }
      // Reset local event + auto-grading state
      setEvent(null);
      setEventDetails(null);
      setEventReadout(null);
      setShowEventReadout(false);
      setAutoGradeKey('');
      setGradingMode('manual');
      setFormulaKey('');
      setFormulaParamsText('');
      try { console.log('✅ [EditProp] Event unlinked and auto-grade reset', { propId }); } catch {}
    } catch (e) {
      try { console.error('❌ [EditProp] Failed to unlink event', { propId, error: e?.message }); } catch {}
      setError(e?.message || 'Failed to remove linked event');
    }
  };

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
  const [teamOptions, setTeamOptions] = useState([]);
  const [teamToAdd, setTeamToAdd] = useState('');
  const [updatingTeams, setUpdatingTeams] = useState(false);
  const [teamsError, setTeamsError] = useState('');
  const [event, setEvent] = useState(null);
  const [eventDetails, setEventDetails] = useState(null);
  const currentLeague = event?.eventLeague || eventDetails?.eventLeague || '';
  const availableTeams = useMemo(() => {
    const leagueLower = String(currentLeague || '').toLowerCase();
    const opts = Array.isArray(teamOptions) ? teamOptions : [];
    if (!leagueLower) return opts;
    return opts.filter((t) => String(t.teamType || '').toLowerCase() === leagueLower);
  }, [teamOptions, currentLeague]);

  const handleAddTeam = () => {
    if (!teamToAdd) return;
    if (teams.includes(teamToAdd)) return;
    setTeams([...teams, teamToAdd]);
    setTeamToAdd('');
  };

  const handleRemoveTeam = (id) => {
    setTeams((prev) => prev.filter((t) => String(t) !== String(id)));
  };

  const handleSaveTeams = async () => {
    if (!propId) return;
    setUpdatingTeams(true);
    setTeamsError('');
    try {
      const res = await fetch(`/api/admin/props/${encodeURIComponent(propId)}/teams`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamIds: teams }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.success) throw new Error(json?.error || 'Failed to update linked teams');
    } catch (e) {
      setTeamsError(e?.message || 'Failed to update linked teams');
    } finally {
      setUpdatingTeams(false);
    }
  };
  const [propOpenTime, setPropOpenTime] = useState('');
  const [propCloseTime, setPropCloseTime] = useState('');
  const [propCoverSource, setPropCoverSource] = useState('event');
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
      formulaKey: 'player_multi_stat_h2h',
      displayName: 'Player Multi Stat H2H',
      description: 'Compare two players by sum of multiple stats; winner per rule.',
      dataSource: 'major-mlb',
      defaultParams: {
        gradingType: 'player_multi_stat_h2h',
        entity: 'player',
        metrics: [],
        winnerRule: 'higher',
      },
    },
    {
      formulaKey: 'team_multi_stat_ou',
      displayName: 'Team Multi Stat O/U',
      description: 'Sum multiple team stats against A/B thresholds (>= or <=).',
      dataSource: 'major-mlb',
      defaultParams: {
        gradingType: 'team_multi_stat_ou',
        entity: 'team',
        metrics: [],
        sides: {
          A: { comparator: 'gte', threshold: 1 },
          B: { comparator: 'lte', threshold: 0 },
        },
      },
    },
    {
      formulaKey: 'team_multi_stat_h2h',
      displayName: 'Team Multi Stat H2H',
      description: 'Head-to-head teams by sum of multiple team stats; winner per rule.',
      dataSource: 'major-mlb',
      defaultParams: {
        gradingType: 'team_multi_stat_h2h',
        entity: 'team',
        metrics: [],
        winnerRule: 'higher',
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
  // Odds fetch helpers (Team Winner moneylines)
  const [oddsLoadingSide, setOddsLoadingSide] = useState(null);
  const [oddsError, setOddsError] = useState('');
  // Auto grade (dry-run) preview state
  const [gradePreviewLoading, setGradePreviewLoading] = useState(false);
  const [gradePreviewError, setGradePreviewError] = useState('');
  const [gradePreview, setGradePreview] = useState(null);
  const [gradePreviewRequest, setGradePreviewRequest] = useState(null);
  const [playersById, setPlayersById] = useState({});
  const [playersLoading, setPlayersLoading] = useState(false);
  const [playersError, setPlayersError] = useState('');
  const [gamePlayerIds, setGamePlayerIds] = useState([]);
  // Metrics for Stat O/U
  const [metricOptions, setMetricOptions] = useState([]);
  const [metricLoading, setMetricLoading] = useState(false);
  const [metricError, setMetricError] = useState('');
  // Fallback NFL team metrics for future events
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
  // Multi metric selection state (for player_multi_stat_ou)
  const metricsSelected = useMemo(() => {
    try { const o = formulaParamsText && formulaParamsText.trim() ? JSON.parse(formulaParamsText) : {}; return Array.isArray(o.metrics) ? o.metrics : []; } catch { return []; }
  }, [formulaParamsText]);

  // Auto-grading mode selection key (must be declared before effects that depend on it)
  const [autoGradeKey, setAutoGradeKey] = useState('');

  // New state for team cover (declare before any hooks that depend on eventDetails)
  const [teamCoverUrl, setTeamCoverUrl] = useState(null);
  const [eventCoverUrl, setEventCoverUrl] = useState(null);
  const [customCoverUrl, setCustomCoverUrl] = useState('');
  const [customCoverFile, setCustomCoverFile] = useState(null);
  const [customCoverPreview, setCustomCoverPreview] = useState(null);
  const [uploadingCustomCover, setUploadingCustomCover] = useState(false);
  const [customCoverUploadError, setCustomCoverUploadError] = useState('');

  const handleCustomCoverFileChange = (e) => {
    try {
      const file = e?.target?.files?.[0] || null;
      setCustomCoverFile(file || null);
      setCustomCoverUploadError('');
      if (file) {
        const reader = new FileReader();
        reader.onload = () => setCustomCoverPreview(reader.result);
        reader.readAsDataURL(file);
      } else {
        setCustomCoverPreview(null);
      }
    } catch {}
  };

  const handleUploadCustomCover = async () => {
    if (!customCoverFile || !customCoverPreview) return;
    setUploadingCustomCover(true);
    setCustomCoverUploadError('');
    try {
      const base64Data = String(customCoverPreview).split(',')[1];
      const res = await fetch('/api/admin/uploadPropCover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: customCoverFile.name || 'prop-cover.png', fileData: base64Data }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.success || !json?.url) {
        throw new Error(json?.error || 'Upload failed');
      }
      setCustomCoverUrl(json.url);
      setCustomCoverFile(null);
      setCustomCoverPreview(null);
    } catch (e) {
      setCustomCoverUploadError(e?.message || 'Upload failed');
    } finally {
      setUploadingCustomCover(false);
    }
  };

  // Load teams for abbreviation lookups (used to source Team ABV A/B from DB abbreviations)
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/teams');
        const data = await res.json();
        if (!res.ok || !data?.success) return;
        setTeamOptions(Array.isArray(data.teams) ? data.teams : []);
      } catch {}
    })();
  }, []);

  // Compute the event's team abbreviations from teams table by linked team IDs
  const eventTeamAbvs = useMemo(() => {
    try {
      if (!eventDetails && !event) return [];
      const league = eventDetails?.eventLeague || event?.eventLeague || '';
      const inLeague = (Array.isArray(teamOptions) ? teamOptions : []).filter(t => String(t.teamType || '').toLowerCase() === String(league || '').toLowerCase());
      const ids = [];
      const homeId = Array.isArray(eventDetails?.homeTeamLink) && eventDetails.homeTeamLink[0];
      const awayId = Array.isArray(eventDetails?.awayTeamLink) && eventDetails.awayTeamLink[0];
      if (homeId) ids.push(homeId);
      if (awayId) ids.push(awayId);
      const abvs = ids
        .map(id => {
          const t = inLeague.find(x => x.recordId === id);
          return String(t?.teamAbbreviation || '').toUpperCase();
        })
        .filter(Boolean);
      return Array.from(new Set(abvs));
    } catch { return []; }
  }, [eventDetails?.homeTeamLink, eventDetails?.awayTeamLink, eventDetails?.eventLeague, event?.eventLeague, teamOptions]);

  // Inject unified schema fields into formula params based on selected auto grade type
  useEffect(() => {
    if (!autoGradeKey) return;
    try {
      try { console.log('🧰 [EditProp] Auto-grade key changed', { propId, autoGradeKey, dataSource }); } catch {}
      const obj = formulaParamsText && formulaParamsText.trim() ? JSON.parse(formulaParamsText) : {};
      const source = dataSource || 'major-mlb';
      const assign = (k, v) => { obj[k] = v; };
      if (autoGradeKey === 'who_wins') {
        assign('entity', 'team');
        assign('statScope', 'single');
        assign('compare', 'h2h');
        if (!obj.metric) obj.metric = (source === 'nfl' ? 'points' : 'R');
        if (!obj.winnerRule) obj.winnerRule = 'higher';
      } else if (autoGradeKey === 'spread') {
        assign('entity', 'team');
        assign('statScope', 'single');
        assign('compare', 'spread');
        if (obj.spread == null) obj.spread = -6.5;
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
      }
      // Ensure identity and source details are present when event/dataSource known
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
      try { console.log('🧪 [EditProp] Auto-grade params merged', { params: obj }); } catch {}
    } catch {}
  }, [autoGradeKey, dataSource, event?.espnGameID, event?.eventTime]);
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

  

  // Event API Readout (Major MLB)
  const [showEventReadout, setShowEventReadout] = useState(false);
  const [eventReadoutLoading, setEventReadoutLoading] = useState(false);
  const [eventReadoutError, setEventReadoutError] = useState('');
  const [eventReadout, setEventReadout] = useState(null);
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
        try {
          console.log('📦 [EditProp] Prop loaded', {
            propId,
            propStatus: p.propStatus,
            propType: p.propType,
            gradingMode: p.gradingMode,
            formulaKey: p.formulaKey,
            hasFormulaParams: Boolean(p.formulaParams),
            linkedEventId: p.event?.airtableId || p.event?.id || null,
          });
        } catch {}
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
        try {
          if (p?.event) {
            console.log('🧩 [EditProp] Linked event loaded', {
              propId,
              eventId: p.event?.airtableId || p.event?.id,
              eventTitle: p.event?.eventTitle,
              eventLeague: p.event?.eventLeague,
              espnGameID: p.event?.espnGameID,
              eventTime: p.event?.eventTime,
            });
          } else {
            console.log('⭕ [EditProp] No event linked to prop', { propId });
          }
        } catch {}
        setGradingMode(p.gradingMode || 'manual');
        setFormulaKey(p.formulaKey || '');
        setFormulaParamsText(p.formulaParams || '');
        // Initialize dataSource from params or event league
        try {
          const obj = p.formulaParams ? JSON.parse(p.formulaParams) : {};
          const leagueLc = String(p?.event?.eventLeague || '').toLowerCase();
          const resolved = String(obj?.dataSource || (leagueLc === 'nfl' ? 'nfl' : 'major-mlb'));
          setDataSource(resolved);
          try { console.log('🧪 [EditProp] Data source resolved', { resolved, fromParams: Boolean(obj?.dataSource), league: p?.event?.eventLeague || null }); } catch {}
        } catch {
          const leagueLc = String(p?.event?.eventLeague || '').toLowerCase();
          const resolved = leagueLc === 'nfl' ? 'nfl' : 'major-mlb';
          setDataSource(resolved);
          try { console.log('🧪 [EditProp] Data source inferred from league', { resolved, league: p?.event?.eventLeague || null }); } catch {}
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
          try { console.log('⚙️ [EditProp] Auto-grade init', { mode, formulaKey: fk, whoWinsSideAMap: a || null, whoWinsSideBMap: b || null }); } catch {}
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

  // Compute event cover URL when available
  useEffect(() => {
    if (!eventDetails) { setEventCoverUrl(null); return; }
    try {
      const url = Array.isArray(eventDetails.eventCover) && eventDetails.eventCover[0] && eventDetails.eventCover[0].url
        ? eventDetails.eventCover[0].url
        : (eventDetails.eventCoverURL || null);
      setEventCoverUrl(url || null);
    } catch {
      setEventCoverUrl(null);
    }
  }, [eventDetails]);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!propId) return;
    setSaving(true);
    try {
      console.log('💾 [EditProp] Save initiated', {
        propId,
        propStatus,
        propType,
        autoGradeEnabled: Boolean(autoGradeKey),
        autoGradeKey,
        gradingModeNext: autoGradeKey ? 'auto' : 'manual',
      });
    } catch {}
    setError(null);
    try {
      let finalFormulaParamsText = formulaParamsText;
      if (autoGradeKey === 'player_multi_stat_ou') {
        try {
          const obj = finalFormulaParamsText && finalFormulaParamsText.trim() ? JSON.parse(finalFormulaParamsText) : {};
          const eff = { ...(obj || {}) };
          // Fill from current UI state if missing
          if (!Array.isArray(eff.metrics) || eff.metrics.filter(Boolean).length < 2) {
            const m = Array.isArray(metricsSelected) ? metricsSelected.filter(Boolean) : [];
            if (m.length >= 2) eff.metrics = m;
          }
          if (!eff.playerId && formulaPlayerId) {
            eff.playerId = formulaPlayerId;
          }
          if (event) {
            const gid = String(event?.espnGameID || '').trim();
            if (gid) eff.espnGameID = gid;
            if (event?.eventTime) {
              const d = new Date(event.eventTime);
              eff.gameDate = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
            }
          }
          eff.entity = 'player';
          if (dataSource) eff.dataSource = dataSource;

          // Validate effective params
          const metrics = Array.isArray(eff.metrics) ? eff.metrics.filter(Boolean) : [];
          if (metrics.length < 2) { setError('Please select at least 2 metrics for Player Multi Stat O/U'); setSaving(false); return; }
          if (!eff.playerId) { setError('Please select a player for Player Multi Stat O/U'); setSaving(false); return; }
          const sides = eff.sides || {};
          const a = sides.A || {};
          const b = sides.B || {};
          if (!a.comparator || a.threshold == null || !b.comparator || b.threshold == null) { setError('Please configure both sides comparators and thresholds'); setSaving(false); return; }
          if (!eff.espnGameID) { setError('Missing ESPN game ID on event'); setSaving(false); return; }
          if (!eff.gameDate) { setError('Missing game date on event'); setSaving(false); return; }

          // Persist enriched params
          finalFormulaParamsText = JSON.stringify(eff, null, 2);
          setFormulaParamsText(finalFormulaParamsText);
        } catch {}
      }
      if (autoGradeKey === 'spread') {
        try {
          const obj = finalFormulaParamsText && finalFormulaParamsText.trim() ? JSON.parse(finalFormulaParamsText) : {};
          const eff = { ...(obj || {}) };
          if (event) {
            const gid = String(event?.espnGameID || '').trim();
            if (gid) eff.espnGameID = gid;
            if (event?.eventTime) {
              const d = new Date(event.eventTime);
              eff.gameDate = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
            }
          }
          eff.entity = 'team';
          eff.statScope = 'single';
          eff.compare = 'spread';
          eff.dataSource = 'major-mlb';
          if (!eff.favoriteTeamAbv) { setError('Please select the Favorite Team for Spread.'); setSaving(false); return; }
          const spreadVal = Number(eff.spread);
          if (!Number.isFinite(spreadVal)) { setError('Please enter a numeric negative spread (e.g., -6.5)'); setSaving(false); return; }
          if (!(spreadVal < 0)) { setError('Spread must be negative (favorite handicap), e.g., -6.5'); setSaving(false); return; }
          const twice = spreadVal * 2;
          const isHalf = Math.abs(twice - Math.round(twice)) < 1e-6 && (Math.round(twice) % 2 === 1);
          if (!isHalf) { setError('Spread should end with .5 to avoid pushes (e.g., -6.5)'); setSaving(false); return; }
          if (!eff.espnGameID) { setError('Missing ESPN game ID on event'); setSaving(false); return; }
          if (!eff.gameDate) { setError('Missing game date on event'); setSaving(false); return; }
          finalFormulaParamsText = JSON.stringify(eff, null, 2);
          setFormulaParamsText(finalFormulaParamsText);
        } catch {}
      }
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
        ...(propCoverSource === 'custom' ? { propCover: customCoverUrl || null } : {}),
        gradingMode: autoGradeKey ? 'auto' : 'manual',
        formulaKey: autoGradeKey || undefined,
        formulaParams: finalFormulaParamsText || undefined,
      };
      const res = await fetch('/api/props', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      try { console.log('📨 [EditProp] Save -> PATCH /api/props response', { ok: res.ok, status: res.status }); } catch {}
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to save');
      try { console.log('✅ [EditProp] Save successful, navigating to list'); } catch {}
      // Go back to Admin Props list
      router.push('/admin/props');
    } catch (e) {
      try { console.error('❌ [EditProp] Save failed', { propId, error: e?.message }); } catch {}
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleAutoGradeNow = async () => {};

  

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

  // Odds fetch for Team Winner (A/B) using ESPN provider mapping
  const fetchMoneylineForSide = async (side) => {
    try { setOddsError(''); } catch {}
    try { console.log('[OddsFetch] Clicked', { side, autoGradeKey, dataSource, eventId: event?.id, espnGameID: event?.espnGameID }); } catch {}
    try {
      if (autoGradeKey !== 'who_wins') {
        try { console.warn('[OddsFetch] Not Team Winner. Aborting.'); } catch {}
        setOddsError('Team Winner auto grade must be selected to fetch moneylines.');
        return;
      }
      const league = String((event?.eventLeague || '')).toLowerCase();
      let eventIdToUse = String(event?.espnGameID || '').trim();
      if (!eventIdToUse && (dataSource || 'major-mlb') === 'major-mlb') {
        try {
          const homeAbv = String(event?.homeTeamAbbreviation || '').toUpperCase();
          const awayAbv = String(event?.awayTeamAbbreviation || '').toUpperCase();
          const d = event?.eventTime ? new Date(event.eventTime) : null;
          const yyyymmdd = d ? `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}` : '';
          const u = new URLSearchParams(); u.set('source','major-mlb'); if (yyyymmdd) u.set('gameDate', yyyymmdd);
          const statusUrl = `/api/admin/api-tester/status?${u.toString()}`;
          const r = await fetch(statusUrl);
          const j = await r.json();
          const games = Array.isArray(j?.games) ? j.games : [];
          const byAbv = (g) => String(g?.home || g?.homeTeam || '').toUpperCase() === homeAbv && String(g?.away || g?.awayTeam || '').toUpperCase() === awayAbv;
          const byName = (g) => String(g?.homeTeamName || '').toUpperCase().includes(String(event?.homeTeamName || '').toUpperCase()) && String(g?.awayTeamName || '').toUpperCase().includes(String(event?.awayTeamName || '').toUpperCase());
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
      const money = map === 'home' ? (json?.homeTeamOdds?.moneyLine ?? null) : (json?.awayTeamOdds?.moneyLine ?? null);
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

  // Preview loader: fetch scoreboard/boxscore and ESPN weekly (NFL) to power previewData
  useEffect(() => {
    (async () => {
      try {
        setPreviewError('');
        setPreviewData(null);
        if (!event) return;
        const gid = String(event.espnGameID || '').trim();
        const ds = dataSource || 'major-mlb';
        setPreviewLoading(true);
        // For MLB, attempt status (scoreboard) by date for quick preview
        let statusUrl = null; let espnScoreboardUrl = null; let scoreboard = null;
        if (ds === 'major-mlb') {
          try {
            const d = event?.eventTime ? new Date(event.eventTime) : null;
            const yyyymmdd = d ? `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}` : '';
            if (yyyymmdd) {
              const sp = new URLSearchParams(); sp.set('source','major-mlb'); sp.set('gameDate', yyyymmdd);
              statusUrl = `/api/admin/api-tester/status?${sp.toString()}`;
              const resp = await fetch(statusUrl);
              const json = await resp.json();
              if (resp.ok && json?.success && Array.isArray(json.games)) {
                const homeAbv = String(event?.homeTeamAbbreviation || '').toUpperCase();
                const awayAbv = String(event?.awayTeamAbbreviation || '').toUpperCase();
                if (gid) {
                  scoreboard = json.games.find(g => String(g?.id || g?.gameID || g?.gameId || '').trim() === gid) || null;
                }
                if (!scoreboard && (homeAbv || awayAbv)) {
                  scoreboard = json.games.find(g => String(g?.home || g?.homeTeam || '').toUpperCase() === homeAbv && String(g?.away || g?.awayTeam || '').toUpperCase() === awayAbv) || null;
                }
                if (!scoreboard) scoreboard = json.games[0] || null;
              }
            }
          } catch {}
        }
        // NFL weekly scoreboard when needed (who_wins or team points views)
        let espnWeekly = null;
        try {
          const isTeamView = ['team_stat_over_under','team_stat_h2h','team_multi_stat_ou','team_multi_stat_h2h'].includes(autoGradeKey);
          const needsPoints = (() => {
            try { const o = formulaParamsText && formulaParamsText.trim() ? JSON.parse(formulaParamsText) : {}; const m = String(o.metric || '').toLowerCase(); const ms = Array.isArray(o.metrics) ? o.metrics.map(s=>String(s||'').toLowerCase()) : []; return m === 'points' || ms.includes('points'); } catch { return false; }
          })();
          const needsWeekly = (ds === 'nfl') && (autoGradeKey === 'who_wins' || (isTeamView && needsPoints));
          if (needsWeekly && event?.eventTime) {
            const yr = new Date(event.eventTime).getFullYear();
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
        // Boxscore normalized for stat keys and players
        let boxscoreUrl = null; let normalized = {};
        try {
          let idForBox = gid;
          if (!idForBox && ds === 'major-mlb' && scoreboard && (scoreboard.id || scoreboard.gameID || scoreboard.gameId)) {
            idForBox = String(scoreboard.id || scoreboard.gameID || scoreboard.gameId);
          }
          if (idForBox) {
            boxscoreUrl = `/api/admin/api-tester/boxscore?source=${encodeURIComponent(ds)}&gameID=${encodeURIComponent(idForBox)}`;
            const bs = await fetch(boxscoreUrl); const bj = await bs.json();
            if (bs.ok && bj?.normalized) normalized = bj.normalized;
          }
        } catch {}
        setPreviewData({ source: ds, scoreboard, normalized, espnWeekly, endpoints: { boxscoreUrl, statusUrl, espnScoreboardUrl } });
      } catch (e) {
        setPreviewError(e?.message || 'Failed to load preview');
      } finally {
        setPreviewLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event?.espnGameID, event?.eventTime, event?.eventWeek, event?.homeTeamAbbreviation, event?.awayTeamAbbreviation, dataSource, autoGradeKey, formulaParamsText]);

  // Build current formula params object for preview/dry-run
  const buildCurrentFormulaParams = () => {
    let parsed = {};
    try { parsed = formulaParamsText && formulaParamsText.trim() ? JSON.parse(formulaParamsText) : {}; } catch {}
    // Inject fallbacks for espnGameID/gameDate
    if (!parsed.espnGameID && event?.espnGameID) parsed.espnGameID = String(event.espnGameID);
    if (!parsed.espnGameID && eventReadout?.id) parsed.espnGameID = String(eventReadout.id);
    if (!parsed.gameDate && event?.eventTime) {
      try {
        const d = new Date(event.eventTime);
        const yr = d.getFullYear();
        const mo = String(d.getMonth() + 1).padStart(2, '0');
        const da = String(d.getDate()).padStart(2, '0');
        parsed.gameDate = `${yr}${mo}${da}`;
      } catch {}
    }
    // Prefer dataSource from params; else infer from event league
    if (!parsed.dataSource) {
      const lg = String(event?.eventLeague || dataSource || '').toLowerCase();
      parsed.dataSource = (lg === 'nfl') ? 'nfl' : 'major-mlb';
    }
    return parsed;
  };

  // Trigger a dry-run auto-grade preview
  const handleGradePreview = async () => {
    try {
      setGradePreviewLoading(true);
      setGradePreviewError('');
      setGradePreview(null);
      const airtableId = propId;
      const overrideFormulaParams = buildCurrentFormulaParams();
      try { console.log('🔍 [EditProp] Grade preview request', { airtableId, overrideFormulaParams }); } catch {}
      const request = { airtableId, dryRun: true, overrideFormulaParams, overrideFormulaKey: String(autoGradeKey || formulaKey || '').toLowerCase() };
      setGradePreviewRequest(request);
      const res = await fetch('/api/admin/gradePropByFormula', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });
      const data = await res.json();
      if (!res.ok) {
        setGradePreviewError(data?.error || 'Preview failed');
      }
      setGradePreview(data);
      try { console.log('🧾 [EditProp] Grade preview response', { ok: res.ok, result: data }); } catch {}
    } catch (e) {
      try { console.error('❌ [EditProp] Grade preview failed', { propId, error: e?.message }); } catch {}
      setGradePreviewError(e?.message || 'Preview failed');
    } finally {
      setGradePreviewLoading(false);
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

  const fetchEventApiReadout = async (evOverride) => {
    const evLocal = evOverride || event;
    if (!evLocal?.eventTime) return;
    setEventReadoutLoading(true);
    setEventReadoutError('');
    setEventReadout(null);
    try {
      const d = new Date(evLocal.eventTime);
      const gameDate = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
      const espnId = String(evLocal?.espnGameID || '').trim();
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
      const url = `/api/admin/api-tester/status?${params.toString()}`;
      try {
        console.log('📡 [EditProp] Fetching Event API Readout', {
          propId,
          eventId: evLocal?.airtableId || evLocal?.id,
          eventTitle: evLocal?.eventTitle,
          eventLeague: evLocal?.eventLeague,
          dataSource: src,
          gameDate,
          espnGameID: espnId || null,
          url,
        });
      } catch {}
      const resp = await fetch(url);
      const json = await resp.json();
      if (!resp.ok || !json.success) throw new Error(json.error || 'Failed to fetch event readout');
      const games = Array.isArray(json.games) ? json.games : [];
      // Prefer exact ESPN ID match when present
      let chosen = null;
      if (espnId) {
        chosen = games.find(g => String(g?.id || g?.gameID || g?.gameId || '').trim() === espnId) || null;
      }
      // If no espnId or not found, try to match by away/home abbreviations
      if (!chosen) {
        try {
          const normalizeAbv = (val) => {
            const v = String(val || '').toUpperCase();
            const map = { CWS:'CHW', SDP:'SD', SFG:'SF', TBR:'TB', KCR:'KC', ARZ:'ARI', WSN:'WSH' };
            return map[v] || v;
          };
          const homeAbv = normalizeAbv(evLocal?.homeTeamAbbreviation || eventDetails?.homeTeamAbbreviation || '');
          const awayAbv = normalizeAbv(evLocal?.awayTeamAbbreviation || eventDetails?.awayTeamAbbreviation || '');
          if (homeAbv && awayAbv) {
            chosen = games.find(g => String(g?.home || g?.homeTeam || '').toUpperCase() === homeAbv && String(g?.away || g?.awayTeam || '').toUpperCase() === awayAbv) || null;
          }
          // Fallback: parse from title like "PHI @ LAD" when abbreviations are not on the event record
          if (!chosen) {
            try {
              const title = String(evLocal?.eventTitle || '').toUpperCase();
              const m = title.match(/([A-Z]{2,4})\s*@\s*([A-Z]{2,4})/);
              if (m && m[1] && m[2]) {
                const tAway = normalizeAbv(m[1]);
                const tHome = normalizeAbv(m[2]);
                chosen = games.find(g => String(g?.home || g?.homeTeam || '').toUpperCase() === tHome && String(g?.away || g?.awayTeam || '').toUpperCase() === tAway) || null;
                try { console.log('🧭 [EditProp] Matching via title tokens', { title, parsed: { away: tAway, home: tHome }, matched: Boolean(chosen) }); } catch {}
              }
            } catch {}
          }
        } catch {}
      }
      // Fallback to first
      if (!chosen) chosen = games[0] || null;
      try {
        console.log('📥 [EditProp] Event API Readout received', {
          found: games.length,
          chosen: chosen ? { id: chosen.id, away: chosen.away, home: chosen.home, status: chosen.gameStatus } : null,
        });
      } catch {}
      setEventReadout(chosen);
      // If we successfully matched a game and the linked Event lacks espnGameID, persist relink
      try {
        const linkedEventId = evLocal?.id || evLocal?.airtableId || null;
        const chosenId = String(chosen?.id || chosen?.gameID || chosen?.gameId || '').trim();
        if (linkedEventId && chosenId && !String(evLocal?.espnGameID || '').trim()) {
          const relinkUrl = `/api/admin/events/${encodeURIComponent(linkedEventId)}/relink`;
          const body = {
            sourceEventId: chosenId,
            title: evLocal?.eventTitle || undefined,
            league: evLocal?.eventLeague || undefined,
            eventTime: evLocal?.eventTime || undefined,
          };
          const up = await fetch(relinkUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
          const upJson = await up.json().catch(() => ({}));
          if (up.ok && upJson?.success && upJson?.event) {
            setEvent((prev) => ({ ...(prev || {}), ...upJson.event }));
          }
        }
      } catch {}
    } catch (e) {
      try { console.error('❌ [EditProp] Event API Readout failed', { propId, error: e?.message }); } catch {}
      setEventReadoutError(e.message || 'Failed to fetch event readout');
    } finally {
      setEventReadoutLoading(false);
    }
  };

  // Compare linked event vs readout to surface discrepancies
  useEffect(() => {
    try {
      if (!event && !eventReadout) return;
      const title = String(event?.eventTitle || '').trim();
      const away = String(eventReadout?.away || '').trim();
      const home = String(eventReadout?.home || '').trim();
      const readoutLabel = away && home ? `${away} @ ${home}` : '';
      const gidEvent = String(event?.espnGameID || '').trim();
      const gidReadout = String(eventReadout?.id || '').trim();
      const mismatch = Boolean(title && readoutLabel && title !== readoutLabel);
      const idMismatch = Boolean(gidEvent && gidReadout && gidEvent !== gidReadout);
      console.log('🧮 [EditProp] Event vs Readout comparison', {
        propId,
        event: { title, league: event?.eventLeague || null, espnGameID: gidEvent },
        readout: { id: gidReadout || null, label: readoutLabel || null, status: eventReadout?.gameStatus || null },
        titleMismatch: mismatch,
        idMismatch,
      });
    } catch {}
  }, [event, eventReadout]);
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

  // Load metric keys for Stat O/U, Player H2H, Player Multi Stat O/U/H2H, and Team Stat O/U/H2H (from API tester boxscore normalized.statKeys)
  useEffect(() => {
    if (!(autoGradeKey === 'stat_over_under' || autoGradeKey === 'player_h2h' || autoGradeKey === 'player_multi_stat_ou' || autoGradeKey === 'player_multi_stat_h2h' || autoGradeKey === 'team_stat_h2h' || autoGradeKey === 'team_stat_over_under' || autoGradeKey === 'team_multi_stat_ou' || autoGradeKey === 'team_multi_stat_h2h')) return;
    const gid = String(event?.espnGameID || '').trim();
    if (!gid) return;
    setMetricLoading(true);
    setMetricError('');
    setMetricOptions([]);
    (async () => {
      try {
        const src = dataSource || 'major-mlb';
        const resp = await fetch(`/api/admin/api-tester/boxscore?source=${encodeURIComponent(src)}&gameID=${encodeURIComponent(gid)}`);
        const json = await resp.json();
        if (resp.ok && json?.success) {
          let keys = Array.isArray(json?.normalized?.statKeys) ? json.normalized.statKeys : [];
          // MLB curated fallback when no boxscore keys yet (pre-game)
          if (src === 'major-mlb' && (!Array.isArray(keys) || keys.length === 0)) {
            try {
              const catUrl = `/api/admin/metrics?league=${encodeURIComponent('mlb')}&entity=${encodeURIComponent('player')}&scope=${encodeURIComponent(autoGradeKey.includes('_multi_') ? 'multi' : 'single')}`;
              const cat = await fetch(catUrl);
              const catJson = await cat.json().catch(() => ({}));
              const curated = Array.isArray(catJson?.metrics) && catJson.metrics.length ? catJson.metrics.map(m => m.key) : [];
              if (curated.length) keys = curated;
            } catch {}
          }
          // For team H2H and team OU ensure classic team metrics are present
          if ((autoGradeKey === 'team_stat_h2h' || autoGradeKey === 'team_stat_over_under') && src === 'major-mlb') {
            keys = Array.from(new Set([...(keys || []), 'R', 'H', 'E']));
          }
          // NFL team single/multi stat metrics: derive from team statistics names and include points
          if ((autoGradeKey === 'team_stat_over_under' || autoGradeKey === 'team_multi_stat_ou' || autoGradeKey === 'team_multi_stat_h2h') && src === 'nfl') {
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
                uniq.sort((a, b) => String(a).localeCompare(String(b)));
                keys = uniq;
              }
            } catch {}
            // Always include generic points in case boxscore schema differs
            keys = Array.from(new Set([...(keys || []), 'points']));
            if (!Array.isArray(keys) || keys.length === 0) {
              keys = [...nflTeamMetricFallback, 'points'];
            }
          }
          // Ensure any saved metric(s) remain selectable even if not present in fetched keys
          try {
            const obj = formulaParamsText && formulaParamsText.trim() ? JSON.parse(formulaParamsText) : {};
            const ensure = new Set(Array.isArray(keys) ? keys : []);
            if (obj.metric) ensure.add(String(obj.metric));
            if (Array.isArray(obj.metrics)) {
              for (const m of obj.metrics.filter(Boolean)) ensure.add(String(m));
            }
            keys = Array.from(ensure);
          } catch {}
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
        // Merge MLB RapidAPI roster identities into players map (prefer fetching by teamId; fallback to teamAbv)
        if ((dataSource || 'major-mlb') === 'major-mlb') {
          try {
            const homeLink = Array.isArray(eventDetails?.homeTeamLink) && eventDetails.homeTeamLink[0];
            const awayLink = Array.isArray(eventDetails?.awayTeamLink) && eventDetails.awayTeamLink[0];
            const homeTeamRec = homeLink ? (Array.isArray(teamOptions) ? teamOptions.find((t) => String(t.recordId) === String(homeLink)) : null) : null;
            const awayTeamRec = awayLink ? (Array.isArray(teamOptions) ? teamOptions.find((t) => String(t.recordId) === String(awayLink)) : null) : null;
            const ids = [homeTeamRec?.teamID, awayTeamRec?.teamID].filter(Boolean).map(String);
            let roster = null; let rosterJson = {};
            if (ids.length) {
              roster = await fetch(`/api/admin/api-tester/mlbPlayers?teamId=${encodeURIComponent(ids.join(','))}`);
              rosterJson = await roster.json();
            } else if (abvs.length) {
              roster = await fetch(`/api/admin/api-tester/mlbPlayers?teamAbv=${encodeURIComponent(abvs.join(','))}`);
              rosterJson = await roster.json();
            }
            if (roster && roster.ok && rosterJson?.success && rosterJson.playersById) {
              const merged = { ...(map || {}) };
              for (const [pid, rp] of Object.entries(rosterJson.playersById)) {
                if (!merged[pid]) merged[pid] = rp; else merged[pid] = { ...rp, ...merged[pid] };
              }
              map = merged;
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
  }, [event?.espnGameID, event?.homeTeamAbbreviation, event?.awayTeamAbbreviation, eventDetails?.homeTeamAbbreviation, eventDetails?.awayTeamAbbreviation, eventDetails?.homeTeamLink, eventDetails?.awayTeamLink, teamOptions]);

  // Load players for Stat O/U, Player H2H, and Player Multi Stat modes; roster fallback if needed
  useEffect(() => {
    if (!(autoGradeKey === 'stat_over_under' || autoGradeKey === 'player_h2h' || autoGradeKey === 'player_multi_stat_ou' || autoGradeKey === 'player_multi_stat_h2h')) return;
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
    (async () => {
      try {
        // Prefer boxscore players (includes ESPN IDs), then merge MLB roster identities as best-effort
        let map = {};
        try {
          const box = await fetch(`/api/admin/api-tester/boxscore?source=${encodeURIComponent(dataSource || 'major-mlb')}&gameID=${encodeURIComponent(espnId)}`);
          const boxJson = await box.json();
          map = (box.ok && boxJson?.normalized?.playersById) ? (boxJson.normalized.playersById || {}) : {};
        } catch {}
        if ((dataSource || 'major-mlb') === 'major-mlb') {
          try {
            const homeLink = Array.isArray(eventDetails?.homeTeamLink) && eventDetails.homeTeamLink[0];
            const awayLink = Array.isArray(eventDetails?.awayTeamLink) && eventDetails.awayTeamLink[0];
            const homeTeamRec = homeLink ? (Array.isArray(teamOptions) ? teamOptions.find((t) => String(t.recordId) === String(homeLink)) : null) : null;
            const awayTeamRec = awayLink ? (Array.isArray(teamOptions) ? teamOptions.find((t) => String(t.recordId) === String(awayLink)) : null) : null;
            const ids = [homeTeamRec?.teamID, awayTeamRec?.teamID].filter(Boolean).map(String);
            let roster = null; let rosterJson = {};
            if (ids.length) {
              roster = await fetch(`/api/admin/api-tester/mlbPlayers?teamId=${encodeURIComponent(ids.join(','))}`);
              rosterJson = await roster.json();
            } else if (abvs.length) {
              roster = await fetch(`/api/admin/api-tester/mlbPlayers?teamAbv=${encodeURIComponent(abvs.join(','))}`);
              rosterJson = await roster.json();
            }
            if (roster && roster.ok && rosterJson?.success && rosterJson.playersById) {
              const merged = { ...(map || {}) };
              for (const [pid, rp] of Object.entries(rosterJson.playersById)) {
                if (!merged[pid]) merged[pid] = rp; else merged[pid] = { ...rp, ...merged[pid] };
              }
              map = merged;
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
  }, [autoGradeKey, event?.espnGameID, event?.homeTeamAbbreviation, event?.awayTeamAbbreviation, eventDetails?.homeTeamAbbreviation, eventDetails?.awayTeamAbbreviation, eventDetails?.homeTeamLink, eventDetails?.awayTeamLink, teamOptions]);
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
      {!event && (
        <div className="mb-4 p-3 bg-gray-50 rounded border">
          <div className="text-sm font-medium text-gray-700">No event linked</div>
          <div className="mt-1">
            <button
              type="button"
              onClick={openLinkEventModal}
              className="px-3 py-1 bg-blue-600 text-white rounded"
            >
              Link Event
            </button>
          </div>
        </div>
      )}
      {event && (
        <>
        {/* consolidated below */}
        <div className="mb-4 p-3 bg-gray-50 rounded border">
          <div className="text-sm font-medium text-gray-700">What event is this prop linked to?</div>
          <div className="mt-1 flex items-center gap-2">
            <div className="text-sm text-gray-700">{event?.eventTitle || 'No event linked'}</div>
            <button
              type="button"
              onClick={openLinkEventModal}
              className="mt-1 px-2 py-1 bg-gray-200 rounded"
            >
              Change Event
            </button>
            <button
              type="button"
              onClick={handleUnlinkEvent}
              className="mt-1 px-2 py-1 bg-red-100 text-red-700 rounded"
            >
              Remove Event
            </button>
          </div>
          <div className="mt-2 text-sm">
            {(() => {
              const league = String(event?.eventLeague || propType || '').toLowerCase();
              const gid = String(event?.espnGameID || eventReadout?.id || '').trim();
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
          {autoGradeKey === 'spread' && (
            <div className="mt-3 space-y-2">
              <div className="text-sm font-medium text-gray-700">Spread (favorite covers negative spread)</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Favorite Team</label>
                  <select
                    className="mt-1 block w-full border rounded px-2 py-1"
                    value={(function(){ try { const o=JSON.parse(formulaParamsText||'{}'); return o.favoriteTeamAbv||''; } catch { return ''; } })()}
                    onChange={(e)=>{ try { const o = formulaParamsText && formulaParamsText.trim() ? JSON.parse(formulaParamsText) : {}; o.favoriteTeamAbv = e.target.value; setFormulaParamsText(JSON.stringify(o, null, 2)); } catch {} }}
                  >
                    <option value="">Select favorite…</option>
                    {eventTeamAbvs.map((abv) => (<option key={`spread-fav-${abv}`} value={abv}>{abv}</option>))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Spread (negative, x.5)</label>
                  <input
                    type="number"
                    step="0.5"
                    className="mt-1 block w-full border rounded px-2 py-1"
                    value={(function(){ try { const o=JSON.parse(formulaParamsText||'{}'); return (o.spread ?? ''); } catch { return ''; } })()}
                    onChange={(e)=>{ try { const o = formulaParamsText && formulaParamsText.trim() ? JSON.parse(formulaParamsText) : {}; o.spread = Number(e.target.value); setFormulaParamsText(JSON.stringify(o, null, 2)); } catch {} }}
                  />
                  <div className="text-xs text-gray-600 mt-1">e.g., -6.5 (favorite must win by 7+). Side A = Favorite covers; Side B = Favorite fails to cover.</div>
                </div>
              </div>
            </div>
          )}
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
                    {eventTeamAbvs.map((abv) => (<option key={`teamA-${abv}`} value={abv}>{abv}</option>))}
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
                    {eventTeamAbvs.map((abv) => (<option key={`teamB-${abv}`} value={abv}>{abv}</option>))}
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
          {(autoGradeKey === 'team_multi_stat_h2h') && (
            <div className="mt-3 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Team A Abv</label>
                  <select
                    className="mt-1 block w-full border rounded px-2 py-1"
                    value={(function(){ try { const o=JSON.parse(formulaParamsText||'{}'); return o.teamAbvA||''; } catch { return ''; } })()}
                    onChange={(e)=>{ try { const o = formulaParamsText && formulaParamsText.trim() ? JSON.parse(formulaParamsText) : {}; o.teamAbvA = e.target.value; setFormulaParamsText(JSON.stringify(o, null, 2)); } catch {} }}
                  >
                    <option value="">Select team…</option>
                    {eventTeamAbvs.map((abv) => (<option key={`teamA2-${abv}`} value={abv}>{abv}</option>))}
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
                    {eventTeamAbvs.map((abv) => (<option key={`teamB2-${abv}`} value={abv}>{abv}</option>))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
            </div>
          )}
          {(autoGradeKey === 'team_multi_stat_ou') && (
            <div className="mt-3 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Team Abv</label>
                  <select
                    className="mt-1 block w-full border rounded px-2 py-1"
                    value={(function(){ try { const o=JSON.parse(formulaParamsText||'{}'); return o.teamAbv||''; } catch { return ''; } })()}
                    onChange={(e)=>{ try { const o = formulaParamsText && formulaParamsText.trim() ? JSON.parse(formulaParamsText) : {}; o.teamAbv = e.target.value; setFormulaParamsText(JSON.stringify(o, null, 2)); } catch {} }}
                  >
                    <option value="">Select team…</option>
                    {eventTeamAbvs.map((abv) => (<option key={`teamSingle-${abv}`} value={abv}>{abv}</option>))}
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
              {/* Team & Player selectors moved above per-side block */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Team Abv</label>
                  <select
                    className="mt-1 block w-full border rounded px-2 py-1"
                    value={formulaTeamAbv}
                    onChange={(e)=>{ const v=e.target.value; setFormulaTeamAbv(v); upsertRootParam('teamAbv', v); try { if (v && formulaPlayerId) { const p = playersById?.[formulaPlayerId]; const team = String(p?.teamAbv || '').toUpperCase(); if (team !== String(v).toUpperCase()) { setFormulaPlayerId(''); upsertRootParam('playerId',''); } } } catch {} }}
                  >
                    <option value="">(optional) Team filter</option>
                    {eventTeamAbvs.map((abv) => (<option key={`statou-team-${abv}`} value={abv}>{abv}</option>))}
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
                      onChange={(e)=>{ const v=e.target.value; setFormulaPlayerId(v); upsertRootParam('playerId', v); upsertRootParam('entity', 'player'); }}
                      disabled={Object.keys(playersById || {}).length === 0}
                    >
                      {Object.keys(playersById || {}).length === 0 ? (
                        <option value="">No players found</option>
                      ) : (
                        <>
                          <option value="">Select a player…</option>
                          {Object.entries(playersById)
                            .filter(([id, p]) => {
                              if ((dataSource || 'major-mlb') === 'major-mlb' && !/^\d+$/.test(String(id))) return false;
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
                    {eventTeamAbvs.map((abv) => (<option key={`teamou-team-${abv}`} value={abv}>{abv}</option>))}
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
                <div className="text-gray-700">ESPN GameID: {String(event?.espnGameID || eventReadout?.id || '') || '–'}</div>
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

        {/* Auto grade preview data (dry-run) */}
        <div className="mb-4 p-3 bg-white rounded border">
          <div className="flex items-center justify-between">
            <div className="text-lg font-semibold">Auto grade preview data</div>
            <button
              type="button"
              onClick={handleGradePreview}
              className="px-3 py-1.5 rounded bg-indigo-600 text-white disabled:opacity-60"
              disabled={gradePreviewLoading}
            >
              {gradePreviewLoading ? 'Previewing…' : 'Preview'}
            </button>
          </div>
          <p className="text-sm text-gray-600 mt-1">Runs the grader in dry-run to show potential values and grading result before saving.</p>
          {!!gradePreviewError && (
            <div className="mt-2 text-sm text-red-600">{gradePreviewError}</div>
          )}
          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <div className="font-medium">Request</div>
              <pre className="mt-1 text-xs bg-gray-50 p-2 rounded overflow-auto">
                {(() => {
                  try { return JSON.stringify(gradePreviewRequest || { airtableId: propId, dryRun: true, overrideFormulaParams: buildCurrentFormulaParams() }, null, 2); } catch { return ''; }
                })()}
              </pre>
            </div>
            <div>
              <div className="font-medium">Response</div>
              {gradePreviewLoading ? (
                <div className="mt-1 text-sm text-gray-600">Loading…</div>
              ) : (
                <pre className="mt-1 text-xs bg-gray-50 p-2 rounded overflow-auto">
                  {(() => { try { return JSON.stringify(gradePreview || {}, null, 2); } catch { return ''; } })()}
                </pre>
              )}
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
          <label className="block text-sm font-medium text-gray-700">Linked Teams</label>
          <div className="mt-1 flex items-center gap-2">
            <select
              className="border rounded px-2 py-1"
              value={teamToAdd}
              onChange={(e) => setTeamToAdd(e.target.value)}
            >
              <option value="">Select team…</option>
              {availableTeams.map((t) => (
                <option key={`opt-${t.recordId}`} value={t.recordId}>
                  {t.teamAbbreviation || t.teamSlug || t.teamName} ({t.teamLeague?.toUpperCase?.() || t.teamLeague})
                </option>
              ))}
            </select>
            <button type="button" className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300" onClick={handleAddTeam} disabled={!teamToAdd}>Add</button>
            <button type="button" className={`px-3 py-1 rounded text-white ${updatingTeams ? 'bg-gray-400' : 'bg-indigo-600 hover:bg-indigo-700'}`} onClick={handleSaveTeams} disabled={updatingTeams}>
              {updatingTeams ? 'Saving…' : 'Save Linked Teams'}
            </button>
          </div>
          {teamsError && <div className="text-red-600 text-sm mt-1">{teamsError}</div>}
          <div className="mt-2 flex flex-wrap gap-2">
            {teams.length === 0 && (
              <span className="text-xs text-gray-500">No linked teams.</span>
            )}
            {teams.map((id) => {
              const t = (teamOptions || []).find((x) => String(x.recordId) === String(id));
              const label = t ? (t.teamAbbreviation || t.teamSlug || t.teamName || id) : id;
              return (
                <span key={`team-${id}`} className="inline-flex items-center gap-2 text-xs bg-gray-100 rounded px-2 py-1">
                  {label}
                  <button type="button" className="text-red-600" onClick={() => handleRemoveTeam(id)}>✕</button>
                </span>
              );
            })}
          </div>
        </div>
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
          <div className="mt-1 flex items-end gap-3">
            <select className="flex-1 block border rounded px-2 py-1" value={propCoverSource} onChange={(e) => setPropCoverSource(e.target.value)}>
              <option value="event">Event</option>
              <option value="homeTeam" disabled={!eventDetails}>{homeTeamName ? `${homeTeamName} (Home)` : 'Home Team'}</option>
              <option value="awayTeam" disabled={!eventDetails}>{awayTeamName ? `${awayTeamName} (Away)` : 'Away Team'}</option>
              <option value="custom">Custom</option>
            </select>
            <div className="relative w-16 h-16 border rounded bg-gray-50">
              {(() => {
                let url = null;
                if (propCoverSource === 'event') url = eventCoverUrl;
                else if (propCoverSource === 'homeTeam' || propCoverSource === 'awayTeam') url = teamCoverUrl;
                else if (propCoverSource === 'custom') url = customCoverUrl;
                if (!url) return (<div className="absolute inset-0 flex items-center justify-center text-[10px] text-gray-400">No cover</div>);
                const fit = (propCoverSource === 'homeTeam' || propCoverSource === 'awayTeam') ? 'object-contain p-1 bg-white' : 'object-cover';
                return (<img src={url} alt="Cover Preview" className={`absolute inset-0 h-full w-full ${fit} rounded`} />);
              })()}
            </div>
          </div>
        </div>
        {propCoverSource === 'custom' && (
          <div>
            <label className="block text-sm font-medium text-gray-700">Custom Cover URL</label>
            <input
              type="url"
              className="mt-1 block w-full border rounded px-2 py-1"
              value={customCoverUrl}
              onChange={(e) => setCustomCoverUrl(e.target.value)}
              placeholder="https://..."
            />
            <div className="mt-2 flex items-center gap-2">
              <input type="file" accept="image/*" onChange={handleCustomCoverFileChange} />
              <button
                type="button"
                className="px-3 py-1 bg-gray-200 text-gray-800 rounded hover:bg-gray-300 disabled:opacity-50"
                disabled={uploadingCustomCover || !customCoverPreview}
                onClick={handleUploadCustomCover}
              >
                {uploadingCustomCover ? 'Uploading…' : 'Upload'}
              </button>
              {customCoverPreview && (
                <img src={customCoverPreview} alt="Selected" className="w-10 h-10 object-cover rounded border" />
              )}
            </div>
            {customCoverUploadError ? <div className="text-red-600 text-xs mt-1">{customCoverUploadError}</div> : null}
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


