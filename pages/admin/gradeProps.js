import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { useSession } from "next-auth/react";
import Link from "next/link";
import Toast from "../../components/Toast";
import GlobalModal from "../../components/modals/GlobalModal";

export default function GradePropsPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const idsParam = typeof router.query.ids === 'string' ? router.query.ids : '';
  const propIDs = useMemo(() => idsParam ? idsParam.split(',').filter(Boolean) : [], [idsParam]);

  const [propsList, setPropsList] = useState([]);
  const [statuses, setStatuses] = useState({});
  const [results, setResults] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [toastMessage, setToastMessage] = useState("");
  const [resultLog, setResultLog] = useState(null);
  const [showResultModal, setShowResultModal] = useState(false);
  // API readout per-prop (Major MLB scoreboard)
  const [apiReadouts, setApiReadouts] = useState({}); // { [airtableId]: { loading, error, game } }
  // Debug toggles per-prop
  const [debugOpen, setDebugOpen] = useState({});
  // Preview results per-prop
  const [previews, setPreviews] = useState({}); // { [airtableId]: { loading, error, request, response } }

  // Helpers for logging and derived state
  const getComputedType = (prop) => {
    try {
      const isAuto = String(prop?.gradingMode || '').toLowerCase() === 'auto';
      const fp = prop?.formulaParams ? JSON.parse(prop.formulaParams) : {};
      const persisted = String(fp?.gradingType || '').toLowerCase();
      const inferred = (fp?.playerAId && fp?.playerBId) || (fp?.teamAbvA && fp?.teamAbvB) ? 'h2h' : 'individual';
      const type = isAuto
        ? ((persisted === 'h2h' || persisted === 'team_h2h') ? 'h2h' : (persisted === 'individual' ? 'individual' : inferred))
        : 'manual';
      console.log('[GradeProps] compute type', {
        airtableId: prop?.airtableId,
        isAuto,
        persisted,
        inferred,
        finalType: type,
      });
      return type;
    } catch (e) {
      console.log('[GradeProps] compute type error', e);
      return 'manual';
    }
  };

  const isAutoGradeActionEnabled = (prop) => {
    try {
      const fp = prop?.formulaParams ? JSON.parse(prop.formulaParams) : {};
      const rule = String(fp.compareRule || '').toLowerCase();
      const type = getComputedType(prop);
      const hasGameDate = Boolean(fp.gameDate || prop.propEventTimeLookup);
      const enabled = type === 'h2h'
        ? Boolean(String(fp.playerAId || '').trim() && String(fp.playerBId || '').trim() && hasGameDate)
        : Boolean(String(fp.playerId || '').trim() && hasGameDate);
      console.log('[GradeProps] autograde enablement', {
        airtableId: prop?.airtableId,
        type,
        rule,
        hasGameDate,
        playerId: fp.playerId || null,
        playerAId: fp.playerAId || null,
        playerBId: fp.playerBId || null,
        enabled,
      });
      return enabled;
    } catch (e) {
      console.log('[GradeProps] autograde enablement error', e);
      return false;
    }
  };

  useEffect(() => {
    if (propIDs.length === 0) return;
    setLoading(true);
    fetch("/api/admin/getPropsByIDs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ propIDs }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          const list = data.props || [];
          setPropsList(list);
          try {
            console.log('[GradeProps] Loaded props', { count: list.length });
            list.forEach((p) => {
              // Log type detection snapshot
              try {
                const fp = p?.formulaParams ? JSON.parse(p.formulaParams) : {};
                const type = getComputedType(p);
                console.log('[GradeProps] Prop snapshot', {
                  airtableId: p.airtableId,
                  gradingMode: p.gradingMode,
                  formulaKey: p.formulaKey,
                  gradingTypePersisted: fp?.gradingType || null,
                  playerId: fp?.playerId || null,
                  playerAId: fp?.playerAId || null,
                  playerBId: fp?.playerBId || null,
                  gameDate: fp?.gameDate || null,
                  type,
                });
              } catch (e) {
                console.log('[GradeProps] Prop snapshot parse error', p?.airtableId, e);
              }
            });
          } catch {}
          const initSt = {};
          const initRes = {};
          list.forEach((p) => {
            initSt[p.airtableId] = p.propStatus;
            initRes[p.airtableId] = p.propResult || "";
          });
          setStatuses(initSt);
          setResults(initRes);
        } else {
          setSaveError(data.error || "Failed to load props");
        }
      })
      .catch((err) => setSaveError(err.message))
      .finally(() => setLoading(false));
  }, [propIDs]);

  // Fetch API readout (scoreboard) for each loaded prop
  useEffect(() => {
    if (!Array.isArray(propsList) || propsList.length === 0) return;
    const next = { ...apiReadouts };
    const doFetch = async (prop) => {
      const id = prop.airtableId;
      if (!id || next[id]?.loading) return;
      next[id] = { loading: true, error: '', game: null };
      setApiReadouts({ ...next });
      try {
        // Derive espnGameID and YYYYMMDD and choose source
        let espnId = String(prop?.propESPNLookup || '').trim();
        let yyyymmdd = '';
        // Choose source by league or formula params; nfl if propLeagueLookup === 'nfl'
        let source = (prop?.propLeagueLookup && String(prop.propLeagueLookup).toLowerCase() === 'nfl') ? 'nfl' : 'major-mlb';
        try {
          const fp = prop?.formulaParams ? JSON.parse(prop.formulaParams) : {};
          if (!espnId && fp?.espnGameID) espnId = String(fp.espnGameID).trim();
          if (String(fp?.dataSource || '').toLowerCase() === 'nfl') source = 'nfl';
          if (fp?.gameDate) yyyymmdd = String(fp.gameDate);
        } catch {}
        if (!yyyymmdd && prop?.propEventTimeLookup) {
          try {
            const d = new Date(prop.propEventTimeLookup);
            const yr = d.getFullYear();
            const mo = String(d.getMonth() + 1).padStart(2, '0');
            const da = String(d.getDate()).padStart(2, '0');
            yyyymmdd = `${yr}${mo}${da}`;
          } catch {}
        }
        if (!source && prop?.propLeagueLookup) {
          const lg = String(prop.propLeagueLookup).toLowerCase();
          if (lg === 'nfl') source = 'nfl';
        } else if (prop?.propLeagueLookup && String(prop.propLeagueLookup).toLowerCase() === 'nfl') {
          source = 'nfl';
        }
        // NFL path requires year/week instead of yyyymmdd; derive when possible
        let query = '';
        if (source === 'nfl') {
          const d = prop?.propEventTimeLookup ? new Date(prop.propEventTimeLookup) : (yyyymmdd ? new Date(`${yyyymmdd.slice(0,4)}-${yyyymmdd.slice(4,6)}-${yyyymmdd.slice(6,8)}`) : null);
          const yr = d ? d.getFullYear() : new Date().getFullYear();
          // Best-effort week: prefer prop.propEventWeek if provided API returned it
          const wk = prop?.propEventWeek || 1;
          const nflParams = new URLSearchParams();
          nflParams.set('source', 'nfl');
          nflParams.set('year', String(yr));
          nflParams.set('week', String(wk));
          if (espnId) nflParams.set('gameID', espnId);
          query = nflParams.toString();
        } else {
          const params = new URLSearchParams();
          params.set('source', 'major-mlb');
          if (yyyymmdd) params.set('gameDate', yyyymmdd);
          if (espnId) params.set('gameID', espnId);
          query = params.toString();
        }
        const resp = await fetch(`/api/admin/api-tester/status?${query}`);
        const json = await resp.json();
        if (!resp.ok || !json?.success) throw new Error(json?.error || 'Failed to fetch event readout');
        const game = Array.isArray(json?.games) ? json.games[0] : null;
        next[id] = { loading: false, error: '', game };
        setApiReadouts({ ...next });
      } catch (e) {
        next[prop.airtableId] = { loading: false, error: e?.message || 'Failed to load', game: null };
        setApiReadouts({ ...next });
      }
    };
    propsList.forEach((p) => doFetch(p));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propsList]);

  const handleStatusChange = (airtableId, value) => {
    setStatuses((prev) => ({ ...prev, [airtableId]: value }));
  };
  const handleResultChange = (airtableId, value) => {
    setResults((prev) => ({ ...prev, [airtableId]: value }));
  };

  const handleSave = async () => {
    console.log("📝 [GradeProps] Save clicked. Preparing updates...");
    setSaving(true);
    setSaveError(null);
    try {
      const updates = propsList.map((p) => ({
        airtableId: p.airtableId,
        propID: p.propID,
        packID: p.packID,
        propStatus: statuses[p.airtableId],
        propResult: results[p.airtableId],
      }));
      console.log("📦 [GradeProps] Updates payload constructed:", {
        count: updates.length,
        updates: updates.map(u => ({ airtableId: u.airtableId, propID: u.propID, packID: u.packID, propStatus: u.propStatus, propResult: u.propResult }))
      });
      console.log("🚀 [GradeProps] Sending POST → /api/admin/updatePropsStatus");
      const res = await fetch("/api/admin/updatePropsStatus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates }),
      });
      const result = await res.json();
      console.log("📥 [GradeProps] Response received from server:", result);
      if (!result.success) {
        console.error("❌ [GradeProps] Save failed:", result.error);
        setSaveError(result.error || "Save failed");
      } else {
        setToastMessage("Grades saved successfully!");
        // Show result log modal with details: updated props, packs processed, and SMS results
        setResultLog({
          smsCount: result.smsCount || 0,
          updatedProps: result.details?.updatedProps || [],
          propToPacks: result.details?.propToPacks || [],
          packsProcessed: result.details?.packsProcessed || [],
        });
        // Log notable details for visibility
        const achievements = result.details?.achievementsCreated || [];
        const updatedCount = (result.details?.updatedProps || []).length;
        const packsCount = (result.details?.packsProcessed || []).length;
        console.log("✅ [GradeProps] Save succeeded:", {
          updatedPropsCount: updatedCount,
          packsProcessedCount: packsCount,
          smsCount: result.smsCount || 0,
          achievementsCreatedCount: achievements.length,
          achievementsCreated: achievements,
        });
        setShowResultModal(true);
      }
    } catch (err) {
      console.error("💥 [GradeProps] Network/Unexpected error during save:", err);
      setSaveError(err.message);
    } finally {
      console.log("🏁 [GradeProps] Save flow finished.");
      setSaving(false);
    }
  };

  const handleAutoGradeOne = async (airtableId) => {
    const startedAt = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    try {
      const prop = (propsList || []).find(p => p.airtableId === airtableId) || null;
      console.log('[GradeProps] Auto grade clicked', {
        airtableId,
        hasProp: !!prop,
        gradingMode: prop?.gradingMode,
        formulaKey: prop?.formulaKey,
        formulaParamsPreview: (prop?.formulaParams || '').slice(0, 200),
      });
      // Preflight: ensure required formula params are present
      let parsedParams = {};
      if (prop?.formulaParams) {
        try { parsedParams = JSON.parse(prop.formulaParams); } catch {}
      }
      const fk = String(prop?.formulaKey || '').toLowerCase();
      // Global fallback injectors before validation
      if (!parsedParams.espnGameID && prop?.propESPNLookup) {
        parsedParams.espnGameID = String(prop.propESPNLookup);
      }
      // Fallback to Event API Readout game ID if present
      if (!parsedParams.espnGameID && apiReadouts?.[airtableId]?.game?.id) {
        parsedParams.espnGameID = String(apiReadouts[airtableId].game.id);
        console.log('[GradeProps] Injected espnGameID from readout', { airtableId, espnGameID: parsedParams.espnGameID });
      }
      // Inference helpers shared by all formulas
      const ensureGameDateFromLookups = () => {
        if (!parsedParams.gameDate && prop?.propEventTimeLookup) {
          try {
            const d = new Date(prop.propEventTimeLookup);
            const yr = d.getFullYear();
            const mo = String(d.getMonth() + 1).padStart(2, '0');
            const da = String(d.getDate()).padStart(2, '0');
            parsedParams.gameDate = `${yr}${mo}${da}`;
            console.log('[GradeProps] Inferred gameDate from propEventTimeLookup', { gameDate: parsedParams.gameDate });
          } catch {}
        }
        if (!parsedParams.gameDate && parsedParams.gameId) {
          const m = String(parsedParams.gameId).match(/^(\d{8})_/);
          if (m) {
            parsedParams.gameDate = m[1];
            console.log('[GradeProps] Inferred gameDate from formulaParams.gameId', { gameDate: parsedParams.gameDate });
          }
        }
      };

      let missing = [];
      if (fk === 'who_wins') {
        // Team Winner formula preflight
        ensureGameDateFromLookups();
        const a = parsedParams?.whoWins?.sideAMap;
        const b = parsedParams?.whoWins?.sideBMap;
        if (!parsedParams.espnGameID) missing.push('espnGameID');
        if (!parsedParams.gameDate) missing.push('gameDate');
        if (!a) missing.push('whoWins.sideAMap');
        if (!b) missing.push('whoWins.sideBMap');
      } else if (fk === 'stat_over_under') {
        // Stat Over/Under preflight (MVP: player-only)
        ensureGameDateFromLookups();
        const sides = parsedParams?.sides || {};
        const a = sides?.A || {};
        const b = sides?.B || {};
        if (!parsedParams.espnGameID) missing.push('espnGameID');
        if (!parsedParams.gameDate) missing.push('gameDate');
        if (!parsedParams.metric) missing.push('metric');
        if (!a.comparator) missing.push('sides.A.comparator');
        if (a.threshold == null) missing.push('sides.A.threshold');
        if (!b.comparator) missing.push('sides.B.comparator');
        if (b.threshold == null) missing.push('sides.B.threshold');
        const entity = String(parsedParams.entity || 'player').toLowerCase();
        if (entity !== 'player') missing.push('entity must be "player" (MVP)');
        if (!parsedParams.playerId) missing.push('playerId');
      } else if (fk === 'player_h2h') {
        ensureGameDateFromLookups();
        if (!parsedParams.espnGameID) missing.push('espnGameID');
        if (!parsedParams.gameDate) missing.push('gameDate');
        if (!parsedParams.metric) missing.push('metric');
        if (!parsedParams.playerAId) missing.push('playerAId');
        if (!parsedParams.playerBId) missing.push('playerBId');
        if (!parsedParams.winnerRule) missing.push('winnerRule');
      } else if (fk === 'player_multi_stat_ou') {
        ensureGameDateFromLookups();
        const metrics = Array.isArray(parsedParams?.metrics) ? parsedParams.metrics.filter(Boolean) : [];
        const sides = parsedParams?.sides || {};
        const a = sides?.A || {};
        const b = sides?.B || {};
        if (!parsedParams.espnGameID) missing.push('espnGameID');
        if (!parsedParams.gameDate) missing.push('gameDate');
        if (!metrics.length) missing.push('metrics[]');
        if (metrics.length > 0 && metrics.length < 2) missing.push('metrics must include at least two');
        if (!parsedParams.playerId) missing.push('playerId');
        if (!a.comparator) missing.push('sides.A.comparator');
        if (a.threshold == null) missing.push('sides.A.threshold');
        if (!b.comparator) missing.push('sides.B.comparator');
        if (b.threshold == null) missing.push('sides.B.threshold');
      } else if (fk === 'player_multi_stat_h2h') {
        ensureGameDateFromLookups();
        const metrics = Array.isArray(parsedParams?.metrics) ? parsedParams.metrics.filter(Boolean) : [];
        if (!parsedParams.espnGameID) missing.push('espnGameID');
        if (!parsedParams.gameDate) missing.push('gameDate');
        if (metrics.length < 2) missing.push('metrics[>=2]');
        if (!parsedParams.playerAId) missing.push('playerAId');
        if (!parsedParams.playerBId) missing.push('playerBId');
      } else if (fk === 'team_stat_over_under') {
        // Team Single Stat Over/Under preflight
        ensureGameDateFromLookups();
        const sides = parsedParams?.sides || {};
        const a = sides?.A || {};
        const b = sides?.B || {};
        if (!parsedParams.espnGameID) missing.push('espnGameID');
        if (!parsedParams.gameDate) missing.push('gameDate');
        if (!parsedParams.metric) missing.push('metric');
        if (!parsedParams.teamAbv) missing.push('teamAbv');
        if (!a.comparator) missing.push('sides.A.comparator');
        if (a.threshold == null) missing.push('sides.A.threshold');
        if (!b.comparator) missing.push('sides.B.comparator');
        if (b.threshold == null) missing.push('sides.B.threshold');
      } else if (fk === 'team_stat_h2h') {
        ensureGameDateFromLookups();
        if (!parsedParams.espnGameID) missing.push('espnGameID');
        if (!parsedParams.gameDate) missing.push('gameDate');
        if (!parsedParams.metric) missing.push('metric');
        if (!parsedParams.teamAbvA) missing.push('teamAbvA');
        if (!parsedParams.teamAbvB) missing.push('teamAbvB');
        if (!parsedParams.winnerRule) missing.push('winnerRule');
      } else {
        // Legacy Individual/H2H preflight
        const isH2H = (() => {
          const persisted = String(parsedParams?.gradingType || '').toLowerCase();
          if (persisted === 'h2h') return true;
          if (persisted === 'individual') return false;
          return Boolean(parsedParams?.playerAId && parsedParams?.playerBId);
        })();
        const required = isH2H ? ['playerAId', 'playerBId', 'gameDate'] : ['playerId', 'gameDate'];
        ensureGameDateFromLookups();
        missing = required.filter((k) => !parsedParams || !parsedParams[k] || String(parsedParams[k]).trim() === '');
      }
      // Fallback injectors: use prop lookups when params were omitted
      if (!parsedParams.espnGameID && prop?.propESPNLookup) {
        parsedParams.espnGameID = String(prop.propESPNLookup);
      }
      if (!parsedParams.espnGameID && apiReadouts?.[airtableId]?.game?.id) {
        parsedParams.espnGameID = String(apiReadouts[airtableId].game.id);
      }
      if (!parsedParams.gameDate && prop?.propEventTimeLookup) {
        try {
          const d = new Date(prop.propEventTimeLookup);
          const yr = d.getFullYear();
          const mo = String(d.getMonth() + 1).padStart(2, '0');
          const da = String(d.getDate()).padStart(2, '0');
          parsedParams.gameDate = `${yr}${mo}${da}`;
        } catch {}
      }
      if (missing.length) {
        const msg = fk === 'who_wins'
          ? `Missing required params: ${missing.join(', ')}. Edit this prop to set Team Winner (A/B teams) and ensure ESPN game ID/date.`
          : `Missing required params: ${missing.join(', ')}. Edit this prop to set player fields.`;
        console.warn('[GradeProps] Preflight failed →', { missing, parsedParams, propEventTimeLookup: prop?.propEventTimeLookup });
        setSaveError(msg);
        setToastMessage('Auto grade preflight failed. See error.');
        return;
      }
      const button = document.getElementById(`autograde-${airtableId}`);
      if (button) button.disabled = true;
      console.log('[GradeProps] Sending POST → /api/admin/gradePropByFormula');
      const res = await fetch('/api/admin/gradePropByFormula', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ airtableId, dryRun: false, overrideFormulaParams: parsedParams }),
      });
      const elapsedMsToHeaders = ((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()) - startedAt;
      console.log('[GradeProps] Response received', { ok: res.ok, status: res.status, elapsedMsToHeaders: Math.round(elapsedMsToHeaders) });
      const data = await res.json();
      console.log('[GradeProps] Parsed response', {
        success: data?.success,
        propStatus: data?.propStatus,
        propResultPreview: (data?.propResult || '').slice(0, 200),
        meta: data?.meta,
      });
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Auto grade failed');
      }
      // Reflect changes in local UI state
      setStatuses(prev => ({ ...prev, [airtableId]: data.propStatus }));
      setResults(prev => ({ ...prev, [airtableId]: data.propResult }));
      setToastMessage('Auto-graded successfully.');
      const totalElapsedMs = ((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()) - startedAt;
      console.log('[GradeProps] Auto grade flow complete', { airtableId, totalElapsedMs: Math.round(totalElapsedMs) });
    } catch (e) {
      console.error('[GradeProps] Auto grade error', e);
      setSaveError(e.message || 'Auto grade failed');
    } finally {
      const button = document.getElementById(`autograde-${airtableId}`);
      if (button) button.disabled = false;
    }
  };

  const handlePreviewOne = async (airtableId) => {
    try {
      const prop = (propsList || []).find(p => p.airtableId === airtableId) || null;
      let parsedParams = {};
      if (prop?.formulaParams) {
        try { parsedParams = JSON.parse(prop.formulaParams); } catch {}
      }
      // Inject fallbacks for espnGameID/gameDate
      if (!parsedParams.espnGameID && prop?.propESPNLookup) parsedParams.espnGameID = String(prop.propESPNLookup);
      // If still missing, use Event API Readout game ID
      if (!parsedParams.espnGameID && apiReadouts?.[airtableId]?.game?.id) {
        parsedParams.espnGameID = String(apiReadouts[airtableId].game.id);
        console.log('[GradeProps] Preview injected espnGameID from readout', { airtableId, espnGameID: parsedParams.espnGameID });
      }
      if (!parsedParams.gameDate && prop?.propEventTimeLookup) {
        try {
          const d = new Date(prop.propEventTimeLookup);
          const yr = d.getFullYear();
          const mo = String(d.getMonth() + 1).padStart(2, '0');
          const da = String(d.getDate()).padStart(2, '0');
          parsedParams.gameDate = `${yr}${mo}${da}`;
        } catch {}
      }
      // Prefer dataSource from params; else infer from league
      if (!parsedParams.dataSource) {
        const lg = String(prop?.propLeagueLookup || '').toLowerCase();
        parsedParams.dataSource = (lg === 'nfl') ? 'nfl' : 'major-mlb';
      }
      setPreviews((prev) => ({ ...prev, [airtableId]: { loading: true, error: '', request: { airtableId, dryRun: true, overrideFormulaParams: parsedParams }, response: null } }));
      const res = await fetch('/api/admin/gradePropByFormula', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ airtableId, dryRun: true, overrideFormulaParams: parsedParams }),
      });
      const data = await res.json();
      setPreviews((prev) => ({ ...prev, [airtableId]: { loading: false, error: res.ok ? '' : (data?.error || 'Preview failed'), request: { airtableId, dryRun: true, overrideFormulaParams: parsedParams }, response: data } }));
    } catch (e) {
      setPreviews((prev) => ({ ...prev, [airtableId]: { loading: false, error: e?.message || 'Preview failed', request: null, response: null } }));
    }
  };

  if (!session?.user) {
    return <div>Not logged in.</div>;
  }

  return (
    <div className="space-y-4">
      {toastMessage && <Toast message={toastMessage} onClose={() => setToastMessage("")} />}
      <h1 className="text-2xl font-bold mb-4">Grade Props</h1>
      <Link href="/admin">
        <button className="text-blue-600 underline mb-4 inline-block">&larr; Back to Admin</button>
      </Link>
      {loading ? (
        <p>Loading props...</p>
      ) : (
        <div className="space-y-4">
          {/* API Readout section */}
          {propsList.length > 0 && (
            <div className="p-3 bg-white rounded border">
              <div className="flex items-center justify-between">
                <div className="text-lg font-semibold">Event API Readout</div>
                <div className="text-sm text-gray-600">Source: Major MLB</div>
              </div>
              <p className="text-sm text-gray-600 mt-1">Live readout for the linked event(s) that will be used for auto grading.</p>
              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                {propsList.map((prop) => {
                  const r = apiReadouts[prop.airtableId] || {};
                  const game = r.game;
                  return (
                    <div key={prop.airtableId} className="p-2 border rounded bg-gray-50">
                      <div className="font-medium text-sm mb-1">{prop.propShort || prop.airtableId}</div>
                      {r.loading && <div className="text-xs text-gray-600">Loading…</div>}
                      {!!r.error && <div className="text-xs text-red-600">{r.error}</div>}
                      {!r.loading && !r.error && game && (
                        <div className="text-xs">
                          <div>ID: {game.id || '–'}</div>
                          <div>Away/Home: {game.away || '–'} @ {game.home || '–'}</div>
                          <div>Status: {game.gameStatus || '–'}</div>
                          <div>When: {game.gameTime ? new Date(game.gameTime).toLocaleString() : '–'}</div>
                          <div className="mt-1 font-medium">Line Score</div>
                          <div>Home R/H/E: {game?.lineScore?.home?.R ?? '–'}/{game?.lineScore?.home?.H ?? '–'}/{game?.lineScore?.home?.E ?? '–'}</div>
                          <div>Away R/H/E: {game?.lineScore?.away?.R ?? '–'}/{game?.lineScore?.away?.H ?? '–'}/{game?.lineScore?.away?.E ?? '–'}</div>
                        </div>
                      )}
                      {!r.loading && !r.error && !game && (
                        <div className="text-xs text-gray-600">No game found for this event/date.</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {propsList.map((prop) => (
            <div key={prop.airtableId} className="space-y-2">
              <div className="flex items-center space-x-4">
                <div className="flex-1">
                  <div className="font-medium">{prop.propShort}</div>
                  <div className="text-sm text-gray-600">{prop.propSummary}</div>
                  {(() => {
                    try {
                      const isAuto = String(prop?.gradingMode || '').toLowerCase() === 'auto';
                      const fk = String(prop?.formulaKey || '');
                      const fp = prop?.formulaParams ? JSON.parse(prop.formulaParams) : {};
                      const isWhoWins = fk === 'who_wins';
                      const whoWinsHasEspn = Boolean(fp.espnGameID || prop.propESPNLookup || (apiReadouts?.[prop.airtableId]?.game?.id));
                      const whoWinsHasDate = Boolean(fp.gameDate || prop.propEventTimeLookup);
                      const readyWhoWins = isWhoWins && Boolean(
                        whoWinsHasEspn && whoWinsHasDate && fp.whoWins && fp.whoWins.sideAMap && fp.whoWins.sideBMap
                      );
                      return (
                        <div className="text-xs mt-1">
                          {isAuto ? (
                            <span className="inline-flex items-center gap-2">
                              <span className="px-2 py-0.5 rounded bg-indigo-100 text-indigo-800">Auto</span>
                              <span className="text-gray-700">{isWhoWins ? 'Team Winner' : (fk || 'Configured')}</span>
                              {isWhoWins && (
                                <span className={`px-2 py-0.5 rounded ${readyWhoWins ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                                  {readyWhoWins ? 'Ready' : 'Needs setup'}
                                </span>
                              )}
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded bg-gray-200 text-gray-700">Manual</span>
                          )}
                        </div>
                      );
                    } catch {
                      return null;
                    }
                  })()}
                  {prop.packInfo && (
                    <div className="text-sm text-gray-700 mt-2">
                      In Pack:{' '}
                      <Link href={`/packs/${prop.packInfo.packURL}`}>
                        <span className="text-blue-600 underline">{prop.packInfo.packTitle || prop.packInfo.packURL || prop.packInfo.packID}</span>
                      </Link>
                    </div>
                  )}
                  {prop.propLeagueLookup && prop.propESPNLookup && (
                    <a
                      href={`https://www.espn.com/${String(prop.propLeagueLookup).toLowerCase()}/boxscore/_/gameId/${prop.propESPNLookup}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 underline text-sm mt-1 block"
                    >
                      View Game
                    </a>
                  )}
                </div>
                <div className="flex space-x-2 items-center">
                  {prop.sideLabels.map((label, i) => {
                    const letter = String.fromCharCode(65 + i);
                    const statusKey = `graded${letter}`;
                    return (
                      <button
                        key={letter}
                        onClick={() => handleStatusChange(prop.airtableId, statusKey)}
                        className={`px-3 py-1 rounded ${
                          statuses[prop.airtableId] === statusKey ? "bg-green-600 text-white" : "bg-gray-200"
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                  <button
                    onClick={() => handleStatusChange(prop.airtableId, 'push')}
                    className={`px-3 py-1 rounded ml-2 ${
                      statuses[prop.airtableId] === 'push' ? 'bg-yellow-600 text-white' : 'bg-gray-200'
                    }`}
                  >
                    Push
                  </button>
                  {(() => {
                    try {
                      const isAuto = String(prop?.gradingMode || '').toLowerCase() === 'auto';
                      const fk = String(prop?.formulaKey || '');
                      const fp = prop?.formulaParams ? JSON.parse(prop.formulaParams) : {};
                      const isWhoWins = fk === 'who_wins';
                      const isStatOU = fk === 'stat_over_under';
                      const isH2H = fk === 'player_h2h';
                      const isTeamH2H = fk === 'team_stat_h2h';
                      const isTeamOU = fk === 'team_stat_over_under';
                      const isMulti = fk === 'player_multi_stat_ou';
                      const isPlayerMultiH2H = fk === 'player_multi_stat_h2h';
                      const whoWinsHasEspn = Boolean(fp.espnGameID || prop.propESPNLookup || (apiReadouts?.[prop.airtableId]?.game?.id));
                      const whoWinsHasDate = Boolean(fp.gameDate || prop.propEventTimeLookup);
                      const readyWhoWins = isWhoWins && Boolean(
                        whoWinsHasEspn && whoWinsHasDate && fp.whoWins && fp.whoWins.sideAMap && fp.whoWins.sideBMap
                      );
                      const readyStatOU = isStatOU && Boolean(
                        fp.espnGameID && fp.gameDate && fp.metric && fp.sides && fp.sides.A && fp.sides.B &&
                        fp.sides.A.comparator && fp.sides.A.threshold != null &&
                        fp.sides.B.comparator && fp.sides.B.threshold != null &&
                        String(fp.entity || 'player').toLowerCase() === 'player' && fp.playerId
                      );
                      const readyH2H = isH2H && Boolean(
                        fp.espnGameID && fp.gameDate && fp.metric && fp.playerAId && fp.playerBId && fp.winnerRule
                      );
                      const readyPlayerMultiH2H = isPlayerMultiH2H && Boolean(
                        fp.espnGameID && (fp.gameDate || prop.propEventTimeLookup) && Array.isArray(fp.metrics) && fp.metrics.filter(Boolean).length >= 2 && fp.playerAId && fp.playerBId && (fp.winnerRule || 'higher')
                      );
                      const readyTeamH2H = isTeamH2H && (() => {
                        const hasGameDate = Boolean(fp.gameDate || prop.propEventTimeLookup);
                        return Boolean(
                          fp.espnGameID && hasGameDate && fp.metric && fp.teamAbvA && fp.teamAbvB && (fp.winnerRule || 'higher')
                        );
                      })();
                      const hasEspnId = Boolean(fp.espnGameID || prop.propESPNLookup);
                      const hasGameDate = Boolean(fp.gameDate || prop.propEventTimeLookup);
                      const metricsOk = Array.isArray(fp.metrics) && fp.metrics.length >= 2;
                      const readyMulti = isMulti && Boolean(
                        hasEspnId && hasGameDate && metricsOk &&
                        String(fp.entity || 'player').toLowerCase() === 'player' && fp.playerId && fp.sides && fp.sides.A && fp.sides.B &&
                        fp.sides.A.comparator && fp.sides.A.threshold != null &&
                        fp.sides.B.comparator && fp.sides.B.threshold != null
                      );
                      const readyTeamOU = isTeamOU && (() => {
                        const hasGameDate = Boolean(fp.gameDate || prop.propEventTimeLookup);
                        const sides = fp.sides || {};
                        const a = sides.A || {};
                        const b = sides.B || {};
                        return Boolean(
                          fp.espnGameID && hasGameDate && fp.metric && fp.teamAbv && a.comparator && a.threshold != null && b.comparator && b.threshold != null
                        );
                      })();
                      if (!isAuto || (!isWhoWins && !isStatOU && !isH2H && !isMulti && !isPlayerMultiH2H && !isTeamH2H && !isTeamOU)) return null;
                      return (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            className="px-3 py-1 rounded bg-gray-200 text-gray-800 hover:bg-gray-300"
                            onClick={() => handlePreviewOne(prop.airtableId)}
                            title="Preview (dry run) the grading request and response"
                          >
                            Preview grading
                          </button>
                          <button
                            id={`autograde-${prop.airtableId}`}
                            onClick={() => handleAutoGradeOne(prop.airtableId)}
                            className="px-3 py-1 rounded bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
                            disabled={!(readyWhoWins || readyStatOU || readyH2H || readyPlayerMultiH2H || readyMulti || readyTeamH2H || readyTeamOU)}
                            title={(readyWhoWins || readyStatOU || readyH2H || readyMulti || readyTeamH2H || readyTeamOU) ? 'Auto grade this prop' : (
                              isWhoWins ? 'Complete setup (espnGameID, gameDate, side maps) to enable auto grade'
                              : isStatOU ? 'Complete setup (espnGameID, gameDate, entity=player, playerId, metric, sides) to enable auto grade'
                              : isH2H ? 'Complete setup (espnGameID, gameDate, metric, playerAId, playerBId, winnerRule) to enable auto grade'
                              : isPlayerMultiH2H ? 'Complete setup (espnGameID, gameDate, metrics[>=2], playerAId, playerBId, winnerRule) to enable auto grade'
                              : isTeamH2H ? 'Complete setup (espnGameID, gameDate, metric, teamAbvA, teamAbvB, winnerRule) to enable auto grade'
                              : isTeamOU ? 'Complete setup (espnGameID, gameDate, metric, teamAbv, sides) to enable auto grade'
                              : 'Complete setup (espnGameID, gameDate, metrics[], entity=player, playerId, sides) to enable auto grade'
                            )}
                          >
                            Auto grade this prop
                          </button>
                        </div>
                      );
                    } catch { return null; }
                  })()}
                </div>
                <div className="mt-2">
                  <input
                    type="text"
                    placeholder="Result"
                    value={results[prop.airtableId] || ''}
                    onChange={(e) => handleResultChange(prop.airtableId, e.target.value)}
                    className="w-full border px-2 py-1 rounded"
                  />
                </div>
                {false && <div />}
                {(() => {
                  const p = previews[prop.airtableId] || {};
                  if (!p.loading && !p.error && !p.response) return null;
                  return (
                    <div className="mt-2 p-2 bg-gray-50 border rounded text-xs">
                      {p.loading && <div>Preview loading…</div>}
                      {!!p.error && <div className="text-red-600">{p.error}</div>}
                      {p.request && (
                        <div className="mt-1">
                          <div className="font-medium">Request</div>
                          <pre className="text-[11px] leading-4 whitespace-pre-wrap break-words">{JSON.stringify(p.request, null, 2)}</pre>
                        </div>
                      )}
                      {p.response && (
                        <div className="mt-1">
                          <div className="font-medium">Response</div>
                          <pre className="text-[11px] leading-4 whitespace-pre-wrap break-words">{JSON.stringify(p.response, null, 2)}</pre>
                        </div>
                      )}
                    </div>
                  );
                })()}
                {/* Formula debug */}
                <div className="mt-2">
                  <button
                    type="button"
                    className="px-2 py-1 text-xs bg-gray-200 rounded"
                    onClick={() => setDebugOpen((prev) => ({ ...prev, [prop.airtableId]: !prev[prop.airtableId] }))}
                  >
                    {debugOpen[prop.airtableId] ? 'Hide formula' : 'Show formula'}
                  </button>
                  {debugOpen[prop.airtableId] && (
                    <div className="mt-2 p-2 bg-gray-50 border rounded">
                      {(() => {
                        try {
                          const fk = String(prop?.formulaKey || '');
                          const fp = prop?.formulaParams ? JSON.parse(prop.formulaParams) : {};
                          const eff = { ...(fp || {}) };
                          if (!eff.espnGameID && prop?.propESPNLookup) eff.espnGameID = String(prop.propESPNLookup);
                          if (!eff.gameDate && prop?.propEventTimeLookup) {
                            try {
                              const d = new Date(prop.propEventTimeLookup);
                              const yr = d.getFullYear();
                              const mo = String(d.getMonth() + 1).padStart(2, '0');
                              const da = String(d.getDate()).padStart(2, '0');
                              eff.gameDate = `${yr}${mo}${da}`;
                            } catch {}
                          }
                          const ds = (() => {
                            const dsParam = String(eff.dataSource || '').toLowerCase();
                            if (dsParam) return dsParam;
                            const lg = String(prop?.propLeagueLookup || '').toLowerCase();
                            return lg === 'nfl' ? 'nfl' : 'major-mlb';
                          })();
                          if (ds) eff.dataSource = ds;
                          const debugObj = { formulaKey: fk, params: eff };
                          return (
                            <pre className="text-[11px] leading-4 whitespace-pre-wrap break-words">{JSON.stringify(debugObj, null, 2)}</pre>
                          );
                        } catch { return null; }
                      })()}
                    </div>
                  )}
                </div>
                {false && (
                  <div className="mt-2 p-2 bg-gray-50 border rounded" />
                )}
              </div>
            </div>
          ))}
          <div className="mt-4">
            <button
              disabled={saving}
              onClick={handleSave}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
            {propsList.length === 1 && (
              <Link href={`/admin/props/${propsList[0].airtableId}`}>
                <button
                  type="button"
                  className="ml-2 px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
                  title="Edit this prop"
                >
                  Edit prop
                </button>
              </Link>
            )}
            {saveError && <p className="text-red-600 mt-2">{saveError}</p>}
          </div>
        </div>
      )}

      {showResultModal && (
        <GlobalModal isOpen={showResultModal} onClose={() => setShowResultModal(false)} className="max-w-4xl">
          <h2 className="text-xl font-bold mb-3">Grading Results</h2>
          {resultLog ? (
            <div className="space-y-4">
              <div className="p-3 bg-gray-50 rounded border">
                <p className="font-medium">Updated Props</p>
                <ul className="list-disc list-inside text-sm mt-2">
                  {resultLog.updatedProps.map((p) => (
                    <li key={p.airtableId}>
                      {p.propID || p.airtableId} — status: <span className="font-mono">{p.propStatus}</span>{p.propResult ? `, result: ${p.propResult}` : ''}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="p-3 bg-gray-50 rounded border">
                <p className="font-medium">Props and Their Packs</p>
                {resultLog.propToPacks.length === 0 ? (
                  <p className="text-sm text-gray-600 mt-2">No related packs found for these props.</p>
                ) : (
                  <ul className="list-disc list-inside text-sm mt-2">
                    {resultLog.propToPacks.map((entry) => (
                      <li key={entry.airtableId}>
                        {entry.propID || entry.airtableId} → {entry.packs.map(pk => pk.packTitle || pk.packURL || pk.airtableId).join(', ')}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="p-3 bg-gray-50 rounded border">
                <p className="font-medium">Packs Affected</p>
                {resultLog.packsProcessed.length === 0 ? (
                  <p className="text-sm text-gray-600 mt-2">No packs graded by this save.</p>
                ) : (
                  <ul className="list-disc list-inside text-sm mt-2">
                    {resultLog.packsProcessed.map((pk) => (
                      <li key={pk.airtableId} className="mb-1">
                        <span className="font-semibold">{pk.packTitle || pk.packURL || pk.airtableId}</span>
                        {typeof pk.ungradedRemaining === 'number' && typeof pk.totalProps === 'number' && (
                          <span className="ml-2 text-gray-700">({pk.totalProps - pk.ungradedRemaining}/{pk.totalProps} graded)</span>
                        )}
                        {pk.wasGraded && <span className="ml-2 px-2 py-0.5 rounded bg-green-100 text-green-800">Pack marked graded</span>}
                        {pk.alreadyGraded && !pk.wasGraded && <span className="ml-2 px-2 py-0.5 rounded bg-gray-100 text-gray-800">Already graded</span>}
                        {typeof pk.ungradedRemaining === 'number' && pk.ungradedRemaining > 0 && (
                          <span className="ml-2 px-2 py-0.5 rounded bg-yellow-100 text-yellow-800">{pk.ungradedRemaining} remaining</span>
                        )}
                        {typeof pk.smsSentCount === 'number' && (
                          <span className="ml-2 text-gray-700">SMS: {pk.smsSentCount}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                <p className="text-sm text-gray-700 mt-2">Total SMS sent: <span className="font-semibold">{resultLog.smsCount}</span></p>
              </div>
              <div className="flex justify-end gap-2">
                <Link href="/admin">
                  <button className="px-4 py-2 bg-gray-600 text-white rounded">Back to Admin</button>
                </Link>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-600">No results to display.</p>
          )}
        </GlobalModal>
      )}
    </div>
  );
}

