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

  // Linked event (from query or modal selection)
  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Cover handling
  const [propCoverSource, setPropCoverSource] = useState('event'); // event | homeTeam | awayTeam | custom
  const [coverFile, setCoverFile] = useState(null);
  const [coverPreview, setCoverPreview] = useState(null);
  const [eventCoverUrl, setEventCoverUrl] = useState(null);
  const [teamCoverUrl, setTeamCoverUrl] = useState(null);

  // Teams (league-scoped) and selection
  const [teamOptions, setTeamOptions] = useState([]);
  const [selectedTeams, setSelectedTeams] = useState([]);

  // Open/Close time
  const [propOpenTime, setPropOpenTime] = useState('');
  const [propCloseTime, setPropCloseTime] = useState('');

  // Auto grading (available when an event is linked)
  const [autoGradeKey, setAutoGradeKey] = useState('');
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
  const [sideAMap, setSideAMap] = useState('');
  const [sideBMap, setSideBMap] = useState('');
  const [teamAbvA, setTeamAbvA] = useState('');
  const [teamAbvB, setTeamAbvB] = useState('');
  const [formulaTeamAbv, setFormulaTeamAbv] = useState('');
  const [formulaPlayerId, setFormulaPlayerId] = useState('');

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

  // Moneyline populate helper (event required)
  const handlePopulateMoneyline = async () => {
    if (!event) return;
    const gameId = event.espnGameID;
    if (!gameId) { setError('Missing espnGameID on event'); return; }
    setLoading(true);
    setError(null);
    try {
      const leagueParam = `baseball/${event.eventLeague}`;
      const url = `/api/admin/vegas-odds?eventId=${encodeURIComponent(gameId)}&league=${encodeURIComponent(leagueParam)}&providerId=58`;
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(`Odds fetch failed: ${res.status}`);
      const data = await res.json();
      const awayRaw = event.awayTeam;
      const homeRaw = event.homeTeam;
      const away = Array.isArray(awayRaw) ? awayRaw[0] : awayRaw || '';
      const home = Array.isArray(homeRaw) ? homeRaw[0] : homeRaw || '';
      setPropSideAShort(away);
      setPropSideBShort(home);
      setPropShort(`Moneyline: ${away} vs ${home}`);
      setPropSideAMoneyline(String(data.awayTeamOdds.moneyLine));
      setPropSideBMoneyline(String(data.homeTeamOdds.moneyLine));
      setPropSideATake(`${away} beat the ${home}`);
      setPropSideBTake(`${home} beat the ${away}`);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  // AI summary via modal (event required)
  const handleGenerateSummary = async (context, model) => {
    const evId = event?.id || eventId;
    if (!evId) { setError('Missing eventId for summary generation'); return; }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/generatePropSummary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId: evId, context, model }),
      });
      const data = await res.json();
      if (data.success) return data.summary;
      setError(data.error || 'AI summary generation failed');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
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

  // Metric options loading for certain auto grade types
  useEffect(() => {
    if (!(autoGradeKey && event?.espnGameID)) return;
    const gid = String(event.espnGameID || '').trim();
    if (!gid) return;
    const needsMetrics = ['stat_over_under', 'player_h2h', 'player_multi_stat_ou', 'team_stat_over_under', 'team_stat_h2h'].includes(autoGradeKey);
    if (!needsMetrics) return;
    setMetricLoading(true);
    setMetricError('');
    setMetricOptions([]);
    (async () => {
      try {
        const resp = await fetch(`/api/admin/api-tester/boxscore?source=major-mlb&gameID=${encodeURIComponent(gid)}`);
        const json = await resp.json();
        let keys = Array.isArray(json?.normalized?.statKeys) ? json.normalized.statKeys : [];
        if (autoGradeKey === 'team_stat_over_under' || autoGradeKey === 'team_stat_h2h') {
          keys = Array.from(new Set([...(keys || []), 'R', 'H', 'E']));
        }
        setMetricOptions(keys);
      } catch (e) {
        setMetricError(e.message || 'Failed to load stat keys');
      } finally {
        setMetricLoading(false);
      }
    })();
  }, [autoGradeKey, event?.espnGameID]);

  // Team abv options derived from event
  const normalizeAbv = (val) => {
    const v = String(val || '').toUpperCase();
    const map = { CWS:'CHW', SDP:'SD', SFG:'SF', TBR:'TB', KCR:'KC', ARZ:'ARI', WSN:'WSH' };
    return map[v] || v;
  };
  const homeTeamName = Array.isArray(event?.homeTeam) ? (event?.homeTeam?.[0] || '') : (event?.homeTeam || '');
  const awayTeamName = Array.isArray(event?.awayTeam) ? (event?.awayTeam?.[0] || '') : (event?.awayTeam || '');

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
        propOpenTime,
        propCloseTime,
        propCoverSource,
        ...(propCoverUrl ? { propCover: propCoverUrl } : {}),
        ...(packId ? { packId } : {}),
        ...(linkedEventId ? { eventId: linkedEventId } : {}),
        ...(selectedTeams && selectedTeams.length ? { teams: selectedTeams } : {}),
      };
      if (linkedEventId) {
        payload.gradingMode = autoGradeKey ? 'auto' : 'manual';
        if (autoGradeKey) {
          payload.formulaKey = autoGradeKey;
          payload.formulaParams = formulaParamsText || undefined;
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
            </div>
          ) : (
            <p>Loading event…</p>
          )}
        </div>
      )}
      {!!packId && (
        <div className="mb-4 p-4 bg-gray-100 rounded">
          <h2 className="text-xl font-semibold">Linked Pack</h2>
          <div className="mt-1 text-sm text-gray-700">Airtable Record ID: {packId}</div>
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
        {propCoverSource === 'event' && eventCoverUrl && (
          <div className="mt-2 text-xs text-gray-700">
            <div className="mb-1">URL:</div>
            <a href={eventCoverUrl} target="_blank" rel="noopener noreferrer" className="block px-2 py-1 border rounded bg-gray-50 break-all">
              {eventCoverUrl}
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
            {eventCoverUrl ? (
              <img src={eventCoverUrl} alt="Event Cover" className="mt-2 h-32 object-contain" />
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
            <label className="block text-sm font-medium text-gray-700 mt-2">Auto Grade Type</label>
            <select
              className="mt-1 block w-full border rounded px-2 py-1"
              value={autoGradeKey}
              onChange={(e) => setAutoGradeKey(e.target.value)}
            >
              <option value="">Manual Grade</option>
              <option value="who_wins">Who Wins</option>
              <option value="stat_over_under">Player Single Stat O/U</option>
              <option value="team_stat_over_under">Team Single Stat O/U</option>
              <option value="team_stat_h2h">Team Stat H2H</option>
              <option value="player_h2h">Player H2H</option>
              <option value="player_multi_stat_ou">Player Multi Stat O/U</option>
            </select>
            {/* Minimal params UI for common cases */}
            {autoGradeKey === 'who_wins' && (
              <div className="mt-3 space-y-2">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm">Take A Team</label>
                    <select className="mt-1 block w-full border rounded px-2 py-1" value={sideAMap} onChange={(e) => { setSideAMap(e.target.value); upsertRootParam('whoWins', { sideAMap: e.target.value, sideBMap }); }}>
                      <option value="away">{awayTeamName || 'Away'}</option>
                      <option value="home">{homeTeamName || 'Home'}</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm">Take B Team</label>
                    <select className="mt-1 block w-full border rounded px-2 py-1" value={sideBMap} onChange={(e) => { setSideBMap(e.target.value); upsertRootParam('whoWins', { sideAMap, sideBMap: e.target.value }); }}>
                      <option value="home">{homeTeamName || 'Home'}</option>
                      <option value="away">{awayTeamName || 'Away'}</option>
                    </select>
                  </div>
                </div>
              </div>
            )}
            {(autoGradeKey === 'stat_over_under' || autoGradeKey === 'player_h2h' || autoGradeKey === 'player_multi_stat_ou' || autoGradeKey === 'team_stat_over_under' || autoGradeKey === 'team_stat_h2h') && (
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
                        {metricOptions.map((k) => (<option key={k} value={k}>{k}</option>))}
                      </select>
                    ) : (
                      <input className="mt-1 block w-full border rounded px-2 py-1" value={(function(){ try { const o=JSON.parse(formulaParamsText||'{}'); return o.metric||''; } catch { return ''; } })()} onChange={(e)=> upsertRootParam('metric', e.target.value)} placeholder="e.g. SO" />
                    )}
                    {!!metricError && <div className="mt-1 text-xs text-red-600">{metricError}</div>}
                  </div>
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
              </div>
            )}
          </div>
          <button type="button" onClick={handlePopulateMoneyline} className="mb-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Populate Moneyline Props</button>
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
          {event && (
            <button
              type="button"
              onClick={() => {
                const away = Array.isArray(event.awayTeam) ? event.awayTeam[0] : event.awayTeam || '';
                const home = Array.isArray(event.homeTeam) ? event.homeTeam[0] : event.homeTeam || '';
                const eventDateTime = event?.eventTime ? new Date(event.eventTime).toLocaleString() : 'the scheduled time';
                const defaultPrompt = `Search the web for the latest news and statistics around the game between ${away} and ${home} on ${eventDateTime}. Write this in long paragraph format filled with stats and narratives.`;
                const serverPrompt = `Write a 30 words max summary previewing the upcoming game between ${away} and ${home} on ${eventDateTime} in the ${event.eventLeague || ''}, use relevant narratives and stats.`;
                openModal('aiSummaryContext', {
                  defaultPrompt,
                  serverPrompt,
                  defaultModel: process.env.NEXT_PUBLIC_OPENAI_DEFAULT_MODEL || 'gpt-4.1',
                  onGenerate: handleGenerateSummary,
                  onUse: (text) => setPropSummary(text)
                });
              }}
              className="mt-2 text-sm bg-indigo-600 text-white rounded px-3 py-1 hover:bg-indigo-700"
            >
              Generate AI Summary
            </button>
          )}
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
        <button type="submit" disabled={loading} className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50">{loading ? 'Creating…' : 'Create Prop'}</button>
      </form>
    </div>
  );
} 