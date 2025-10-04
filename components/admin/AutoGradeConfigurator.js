import React, { useMemo } from 'react';

// Reusable Auto Grade Configurator
// Controlled component: parent owns state; this component renders the common UI
// Required props:
// - event: linked event object (with league/team info)
// - dataSource, setDataSource
// - autoGradeKey, setAutoGradeKey
// - formulaParamsText, setFormulaParamsText
// - metricOptions, metricLoading, metricError
// - selectedMetric, setSelectedMetric
// - selectedMetrics (array), setSelectedMetrics (for multi-metric)
// - teamOptionsH2H (array of team abbreviations when applicable)
// - sideAMap, setSideAMap; sideBMap, setSideBMap (for who_wins)
// - helpers: upsertRootParam(newKey, value)
// Optional props used by certain modes:
// - rosterPlayersById, previewData, formulaTeamAbv, setFormulaTeamAbv, formulaPlayerId, setFormulaPlayerId
// - eventReadout, eventReadoutLoading, fetchEventApiReadout

export default function AutoGradeConfigurator(props) {
  const {
    event,
    dataSource, setDataSource,
    autoGradeKey, setAutoGradeKey,
    formulaParamsText, setFormulaParamsText,
    metricOptions, metricLoading, metricError,
    selectedMetric, setSelectedMetric,
    selectedMetrics, setSelectedMetrics,
    teamOptionsH2H = [],
    sideAMap, setSideAMap,
    sideBMap, setSideBMap,
    upsertRootParam,
    // optional
    rosterPlayersById = {},
    previewData,
    formulaTeamAbv = '', setFormulaTeamAbv = () => {},
    formulaPlayerId = '', setFormulaPlayerId = () => {},
    eventReadout, eventReadoutLoading, fetchEventApiReadout,
    formulas = null, handleSelectFormula = null,
  } = props;

  const abvResolver = useMemo(() => ({
    toAbv: (val) => String(val || '').trim().toUpperCase(),
  }), []);

  const eventTeamAbvs = useMemo(() => {
    try {
      const abvs = [];
      const push = (v) => { const a = Array.isArray(v) ? (v[0] || '') : v; const s = String(a || '').trim().toUpperCase(); if (s) abvs.push(s); };
      push(event?.homeTeamAbbreviation || event?.homeTeam);
      push(event?.awayTeamAbbreviation || event?.awayTeam);
      return Array.from(new Set(abvs));
    } catch { return []; }
  }, [event?.homeTeamAbbreviation, event?.awayTeamAbbreviation, event?.homeTeam, event?.awayTeam]);

  return (
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
          if (typeof handleSelectFormula === 'function') handleSelectFormula(key);
        }}
      >
        <option value="">Manual Grade</option>
        {Array.isArray(formulas) && formulas.length ? (
          formulas.map((f) => (
            <option key={f.formulaKey} value={f.formulaKey}>{f.displayName || f.formulaKey}</option>
          ))
        ) : (
          <>
            <option value="stat_over_under">Player Single Stat O/U</option>
            <option value="team_stat_over_under">Team Single Stat O/U</option>
            <option value="team_stat_h2h">Team Stat H2H</option>
            <option value="player_h2h">Player H2H</option>
            <option value="player_multi_stat_ou">Player Multi Stat O/U</option>
            <option value="player_multi_stat_h2h">Player Multi Stat H2H</option>
            <option value="team_multi_stat_ou">Team Multi Stat O/U</option>
            <option value="team_multi_stat_h2h">Team Multi Stat H2H</option>
            {dataSource === 'major-mlb' && (
              <>
                <option value="spread">Spread (MLB Total O/U)</option>
                <option value="total_runs_over_under">Total Runs O/U (MLB)</option>
              </>
            )}
            <option value="who_wins">Team Winner</option>
          </>
        )}
      </select>

      {/* Spread */}
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

      {/* Who Wins */}
      {autoGradeKey === 'who_wins' && (
        <div className="mt-3 space-y-2">
          <div className="text-sm font-medium text-gray-700">Map takes to teams</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm">Take A Team</label>
              <select className="mt-1 block w-full border rounded px-2 py-1" value={sideAMap} onChange={(e) => setSideAMap(e.target.value)}>
                <option value="away">{Array.isArray(event?.awayTeam) ? (event?.awayTeam?.[0] || 'Away') : (event?.awayTeam || event?.awayTeamAbbreviation || 'Away')}</option>
                <option value="home">{Array.isArray(event?.homeTeam) ? (event?.homeTeam?.[0] || 'Home') : (event?.homeTeam || event?.homeTeamAbbreviation || 'Home')}</option>
              </select>
            </div>
            <div>
              <label className="block text-sm">Take B Team</label>
              <select className="mt-1 block w-full border rounded px-2 py-1" value={sideBMap} onChange={(e) => setSideBMap(e.target.value)}>
                <option value="home">{Array.isArray(event?.homeTeam) ? (event?.homeTeam?.[0] || 'Home') : (event?.homeTeam || event?.homeTeamAbbreviation || 'Home')}</option>
                <option value="away">{Array.isArray(event?.awayTeam) ? (event?.awayTeam?.[0] || 'Away') : (event?.awayTeam || event?.awayTeamAbbreviation || 'Away')}</option>
              </select>
            </div>
          </div>
          {eventReadout && (
            <div className="mt-2 p-2 bg-gray-50 rounded border text-sm">
              <div className="font-medium mb-1">Runs preview</div>
              <div>Home ({Array.isArray(event?.homeTeam) ? (event?.homeTeam[0] || '') : (event?.homeTeam || '')}): {eventReadout?.lineScore?.home?.R ?? '–'}</div>
              <div>Away ({Array.isArray(event?.awayTeam) ? (event?.awayTeam[0] || '') : (event?.awayTeam || '')}): {eventReadout?.lineScore?.away?.R ?? '–'}</div>
              <div className="text-xs text-gray-600 mt-1">Used to determine winner when Final.</div>
            </div>
          )}
          {!eventReadout && !eventReadoutLoading && typeof fetchEventApiReadout === 'function' && (
            <button type="button" onClick={fetchEventApiReadout} className="text-sm text-blue-600 underline">Check event connection</button>
          )}
        </div>
      )}

      {/* Team/Player Stat O/U and H2H (single metric) */}
      {(autoGradeKey === 'stat_over_under' || autoGradeKey === 'team_stat_over_under' || autoGradeKey === 'team_stat_h2h' || autoGradeKey === 'total_runs_over_under') && (
        <div className="mt-3 space-y-3">
          {autoGradeKey === 'team_stat_over_under' && (
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
          {autoGradeKey === 'total_runs_over_under' && (
            <div>
              <div className="text-sm text-gray-700">Total Runs O/U compares combined home+away runs to a threshold.</div>
              <div className="text-xs text-gray-600 mt-1">Metric is fixed to R (runs). No team or player selection needed.</div>
            </div>
          )}
          {autoGradeKey === 'stat_over_under' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700">Team Abv</label>
                <select
                  className="mt-1 block w-full border rounded px-2 py-1"
                  value={formulaTeamAbv}
                  onChange={(e)=>{ const v=e.target.value; setFormulaTeamAbv(v); upsertRootParam('teamAbv', v); try { if (v && formulaPlayerId) { const pEntry = (previewData?.normalized?.playersById && previewData.normalized.playersById[formulaPlayerId]) || null; const team = String(pEntry?.teamAbv || '').toUpperCase(); if (team !== String(v).toUpperCase()) { setFormulaPlayerId(''); upsertRootParam('playerId',''); } } } catch {} }}
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
                  {!previewData?.normalized || Object.keys(previewData?.normalized?.playersById || {}).length === 0 ? (
                    <option value="">No players found</option>
                  ) : (
                    <>
                      <option value="">Select a player…</option>
                      {Object.entries(rosterPlayersById && Object.keys(rosterPlayersById).length ? rosterPlayersById : (previewData.normalized.playersById || {}))
                        .filter(([id, p]) => {
                          const idIsNumeric = /^\d+$/.test(String(id));
                          const hasName = Boolean((p && (p.firstName || p.lastName || p.longName)));
                          if (!(idIsNumeric || hasName)) return false;
                          const filt = abvResolver.toAbv(formulaTeamAbv);
                          if (!filt) return true;
                          return abvResolver.toAbv(p?.teamAbv) === filt;
                        })
                        .sort(([, a], [, b]) => {
                          const lastA = (String(a?.lastName || '').trim()) || (String(a?.longName || '').trim().split(/\s+/).slice(-1)[0] || '');
                          const lastB = (String(b?.lastName || '').trim()) || (String(b?.longName || '').trim().split(/\s+/).slice(-1)[0] || '');
                          const cmp = String(lastA).localeCompare(String(lastB));
                          if (cmp !== 0) return cmp;
                          return String(a?.longName || '').localeCompare(String(b?.longName || ''));
                        })
                        .map(([id, p]) => {
                          const first = String(p?.firstName || '').trim();
                          const last = String(p?.lastName || '').trim() || (String(p?.longName || '').trim().split(/\s+/).slice(-1)[0] || '');
                          const label = last && first ? `${last}, ${first}` : (p?.longName || id);
                          return (
                            <option key={`statou-player-${id}`} value={id}>{label} ({p?.teamAbv || ''})</option>
                          );
                        })}
                    </>
                  )}
                </select>
              </div>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {autoGradeKey !== 'total_runs_over_under' ? (
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
                    <option value="">Select a metric…</option>
                    {(metricOptions || []).map((k) => (
                      <option key={k} value={k}>{k}</option>
                    ))}
                  </select>
                )}
                {!!metricError && <div className="mt-1 text-xs text-red-600">{metricError}</div>}
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium text-gray-700">Metric</label>
                <div className="mt-1 text-sm">R (Runs) — fixed</div>
              </div>
            )}
            {autoGradeKey !== 'team_stat_h2h' && (
              <div>
                <label className="block text-sm font-medium text-gray-700">Comparator & Thresholds</label>
                <div className="grid grid-cols-2 gap-2">
                  <select className="mt-1 block w-full border rounded px-2 py-1" value={(function(){ try { const o=JSON.parse(formulaParamsText||'{}'); return o?.sides?.A?.comparator||'gte'; } catch { return 'gte'; } })()} onChange={(e)=>{ try { const o=JSON.parse(formulaParamsText||'{}')||{}; o.sides = o.sides||{}; o.sides.A = { ...(o.sides.A||{}), comparator: e.target.value }; setFormulaParamsText(JSON.stringify(o, null, 2)); } catch {} }}>
                    <option value="gte">A ≥</option>
                    <option value="lte">A ≤</option>
                  </select>
                  <input className="mt-1 block w-full border rounded px-2 py-1" placeholder="A threshold" value={(function(){ try { const o=JSON.parse(formulaParamsText||'{}'); return o?.sides?.A?.threshold ?? ''; } catch { return ''; } })()} onChange={(e)=>{ try { const o=JSON.parse(formulaParamsText||'{}')||{}; o.sides = o.sides||{}; o.sides.A = { ...(o.sides.A||{}), threshold: e.target.value }; setFormulaParamsText(JSON.stringify(o, null, 2)); } catch {} }} />
                </div>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <select className="mt-1 block w-full border rounded px-2 py-1" value={(function(){ try { const o=JSON.parse(formulaParamsText||'{}'); return o?.sides?.B?.comparator||'lte'; } catch { return 'lte'; } })()} onChange={(e)=>{ try { const o=JSON.parse(formulaParamsText||'{}')||{}; o.sides = o.sides||{}; o.sides.B = { ...(o.sides.B||{}), comparator: e.target.value }; setFormulaParamsText(JSON.stringify(o, null, 2)); } catch {} }}>
                    <option value="gte">B ≥</option>
                    <option value="lte">B ≤</option>
                  </select>
                  <input className="mt-1 block w-full border rounded px-2 py-1" placeholder="B threshold" value={(function(){ try { const o=JSON.parse(formulaParamsText||'{}'); return o?.sides?.B?.threshold ?? ''; } catch { return ''; } })()} onChange={(e)=>{ try { const o=JSON.parse(formulaParamsText||'{}')||{}; o.sides = o.sides||{}; o.sides.B = { ...(o.sides.B||{}), threshold: e.target.value }; setFormulaParamsText(JSON.stringify(o, null, 2)); } catch {} }} />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Multi-stat O/U and H2H */}
      {(autoGradeKey === 'player_multi_stat_ou' || autoGradeKey === 'player_multi_stat_h2h' || autoGradeKey === 'team_multi_stat_ou' || autoGradeKey === 'team_multi_stat_h2h') && (
        <div className="mt-3 space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700">Metrics</label>
            {metricLoading ? (
              <div className="mt-1 text-xs text-gray-600">Loading metrics…</div>
            ) : (
              <select
                multiple
                className="mt-1 block w-full border rounded px-2 py-1 h-32"
                value={Array.isArray(selectedMetrics) ? selectedMetrics : []}
                onChange={(e)=>{
                  const opts = Array.from(e.target.selectedOptions || []).map(o => o.value);
                  setSelectedMetrics(opts);
                  try { const o = formulaParamsText && formulaParamsText.trim() ? JSON.parse(formulaParamsText) : {}; o.metrics = opts; setFormulaParamsText(JSON.stringify(o, null, 2)); } catch {}
                }}
              >
                {(metricOptions || []).map((k) => (
                  <option key={k} value={k}>{k}</option>
                ))}
              </select>
            )}
            {!!metricError && <div className="mt-1 text-xs text-red-600">{metricError}</div>}
          </div>
          {autoGradeKey.includes('_h2h') ? (
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
          ) : (
            <div>
              <label className="block text-sm font-medium text-gray-700">Comparator & Thresholds</label>
              <div className="grid grid-cols-2 gap-2">
                <select className="mt-1 block w-full border rounded px-2 py-1" value={(function(){ try { const o=JSON.parse(formulaParamsText||'{}'); return o?.sides?.A?.comparator||'gte'; } catch { return 'gte'; } })()} onChange={(e)=>{ try { const o=JSON.parse(formulaParamsText||'{}')||{}; o.sides = o.sides||{}; o.sides.A = { ...(o.sides.A||{}), comparator: e.target.value }; setFormulaParamsText(JSON.stringify(o, null, 2)); } catch {} }}>
                  <option value="gte">A ≥</option>
                  <option value="lte">A ≤</option>
                </select>
                <input className="mt-1 block w-full border rounded px-2 py-1" placeholder="A threshold" value={(function(){ try { const o=JSON.parse(formulaParamsText||'{}'); return o?.sides?.A?.threshold ?? ''; } catch { return ''; } })()} onChange={(e)=>{ try { const o=JSON.parse(formulaParamsText||'{}')||{}; o.sides = o.sides||{}; o.sides.A = { ...(o.sides.A||{}), threshold: e.target.value }; setFormulaParamsText(JSON.stringify(o, null, 2)); } catch {} }} />
              </div>
              <div className="grid grid-cols-2 gap-2 mt-2">
                <select className="mt-1 block w-full border rounded px-2 py-1" value={(function(){ try { const o=JSON.parse(formulaParamsText||'{}'); return o?.sides?.B?.comparator||'lte'; } catch { return 'lte'; } })()} onChange={(e)=>{ try { const o=JSON.parse(formulaParamsText||'{}')||{}; o.sides = o.sides||{}; o.sides.B = { ...(o.sides.B||{}), comparator: e.target.value }; setFormulaParamsText(JSON.stringify(o, null, 2)); } catch {} }}>
                  <option value="gte">B ≥</option>
                  <option value="lte">B ≤</option>
                </select>
                <input className="mt-1 block w-full border rounded px-2 py-1" placeholder="B threshold" value={(function(){ try { const o=JSON.parse(formulaParamsText||'{}'); return o?.sides?.B?.threshold ?? ''; } catch { return ''; } })()} onChange={(e)=>{ try { const o=JSON.parse(formulaParamsText||'{}')||{}; o.sides = o.sides||{}; o.sides.B = { ...(o.sides.B||{}), threshold: e.target.value }; setFormulaParamsText(JSON.stringify(o, null, 2)); } catch {} }} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}


