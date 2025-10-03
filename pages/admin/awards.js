import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useModal } from '../../contexts/ModalContext';

export default function AwardsAdminPage() {
  const { openModal } = useModal();
  const [awards, setAwards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [form, setForm] = useState({ kind: 'award', name: '', tokens: 25, code: '', redirectTeamSlug: '', imageUrl: '', imageMode: 'custom', requirementKey: '', requirementTeamSlug: '', requirementSeriesSlug: '', league: '', promoBonusEnabled: false, promoBonusTokens: 25 });
  const [creating, setCreating] = useState(false);
  const [teamOptions, setTeamOptions] = useState([]);
  const [leagueOptions, setLeagueOptions] = useState([]);
  const [teamsLoading, setTeamsLoading] = useState(false);
  const [teamsError, setTeamsError] = useState('');
  const [seriesOptions, setSeriesOptions] = useState([]);
  const [seriesLoading, setSeriesLoading] = useState(false);
  const [seriesError, setSeriesError] = useState('');
  const [copiedCode, setCopiedCode] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/awards/list');
      const data = await res.json();
      if (res.ok && data.success) {
        // Exclude referral auto-awards (ref5:… codes) from generic Awards view
        const list = Array.isArray(data.awards) ? data.awards : [];
        setAwards(list.filter((a) => !String(a.code || '').startsWith('ref5:')));
      } else {
        setError(data.error || 'Failed to load');
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // Ensure promo defaults to follow_team requirement for clarity
  useEffect(() => {
    if (form.kind === 'promo' && form.requirementKey !== 'follow_team') {
      setForm((f) => ({ ...f, requirementKey: 'follow_team' }));
    }
  }, [form.kind]);

  // Load teams for dropdown
  useEffect(() => {
    (async () => {
      setTeamsLoading(true);
      setTeamsError('');
      try {
        const res = await fetch('/api/teams');
        const data = await res.json();
        if (res.ok && data?.success) {
          const teams = Array.isArray(data.teams) ? data.teams : [];
          const filtered = teams.filter((t) => (String(t.teamType || '')).toLowerCase() !== 'league');
          const options = filtered
            .map((t) => {
              const rawSlug = String(t.teamSlug || '').toLowerCase();
              const league = String(t.teamLeague || t.teamType || t.league || '').toLowerCase();
              const label = String(t.teamNameFull || t.teamName || rawSlug || 'Team');
              const logoUrl = t.teamLogoURL || null;
              return rawSlug ? { value: rawSlug, label, league, logoUrl } : null;
            })
            .filter(Boolean)
            .sort((a, b) => a.label.localeCompare(b.label));
          setTeamOptions(options);
          const leagues = Array.from(new Set(options.map(o => o.league).filter(Boolean))).sort();
          setLeagueOptions(leagues);
        } else {
          setTeamsError(data?.error || 'Failed to load teams');
        }
      } catch (e) {
        setTeamsError(e.message || 'Failed to load teams');
      } finally {
        setTeamsLoading(false);
      }
    })();
  }, []);

  // Load series options for follow-series selection
  useEffect(() => {
    (async () => {
      setSeriesLoading(true);
      setSeriesError('');
      try {
        const res = await fetch('/api/series');
        const data = await res.json();
        if (res.ok && data?.success) {
          const opts = Array.isArray(data.series) ? data.series.map(s => ({ value: s.id || s.seriesId, label: s.title || s.seriesId || 'Series' })) : [];
          setSeriesOptions(opts);
        } else {
          setSeriesError(data?.error || 'Failed to load series');
        }
      } catch (e) {
        setSeriesError(e.message || 'Failed to load series');
      } finally {
        setSeriesLoading(false);
      }
    })();
  }, []);

  // Keep options in memory; selection happens inside modal

  const create = async (e) => {
    e.preventDefault();
    setCreating(true);
    try {
      // If Follow Team promo with bonus enabled, create as award with follow requirement
      let kindToSend = form.kind;
      let bonusTokens = null;
      if (form.kind === 'promo' && form.requirementKey === 'follow_team' && form.promoBonusEnabled) {
        kindToSend = 'award';
        bonusTokens = Number(form.promoBonusTokens);
      }

      const payload = {
        kind: kindToSend,
        name: form.name,
        code: form.code || undefined,
        redirectTeamSlug: form.redirectTeamSlug || undefined,
        imageUrl: form.imageMode === 'team-logo' ? undefined : (form.imageUrl || undefined),
        imageMode: form.imageMode || 'custom',
        requirementKey: form.requirementKey || undefined,
        requirementTeamSlug: form.requirementTeamSlug || undefined,
        requirementSeriesSlug: form.requirementSeriesSlug || undefined,
        requirementSeriesId: form.requirementSeriesId || undefined,
      };
      if (kindToSend === 'award') {
        payload.tokens = Number(bonusTokens != null ? bonusTokens : form.tokens);
      }
      const res = await fetch('/api/admin/awards/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setForm({ kind: 'award', name: '', tokens: 25, code: '', redirectTeamSlug: '', imageUrl: '', imageMode: 'custom', requirementKey: '', requirementTeamSlug: '', requirementSeriesSlug: '', league: '', promoBonusEnabled: false, promoBonusTokens: 25 });
        await load();
      } else {
        alert(data.error || 'Create failed');
      }
    } catch (e) {
      alert(e.message);
    } finally {
      setCreating(false);
    }
  };

  const setStatus = async (code, status) => {
    const res = await fetch('/api/admin/awards/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, status }),
    });
    const data = await res.json();
    if (res.ok && data.success) load();
    else alert(data.error || 'Update failed');
  };

  const del = async (code) => {
    if (!confirm(`Delete award ${code}? This cannot be undone.`)) return;
    const res = await fetch('/api/admin/awards/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    const data = await res.json();
    if (res.ok && data.success) load();
    else alert(data.error || 'Delete failed');
  };

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Promo Cards</h1>
        <Link href="/admin" className="text-blue-600 hover:underline">Back to Admin</Link>
      </div>

      <section className="border rounded-lg p-4 mb-6">
        <h2 className="text-lg font-semibold mb-3">Create Promo Card</h2>
        <p className="text-sm text-gray-600 mb-3">Promo Cards can either grant tokens (Award) or encourage following a Team/Series (Promo).</p>
        <form onSubmit={create} className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-sm text-gray-700">Type</label>
            <select
              value={(form.kind === 'award') ? 'award' : (form.requirementKey === 'follow_series' ? 'follow_series' : 'follow_team')}
              onChange={(e) => {
                const v = e.target.value;
                if (v === 'award') {
                  setForm((f) => ({ ...f, kind: 'award', requirementKey: '', requirementTeamSlug: '', requirementSeriesSlug: '' }));
                } else if (v === 'follow_team') {
                  setForm((f) => ({ ...f, kind: 'promo', requirementKey: 'follow_team' }));
                } else if (v === 'follow_series') {
                  setForm((f) => ({ ...f, kind: 'promo', requirementKey: 'follow_series' }));
                }
              }}
              className="mt-1 px-3 py-2 border rounded w-44"
            >
              <option value="award">Award Token</option>
              <option value="follow_team">Follow Team</option>
              <option value="follow_series">Follow Series</option>
            </select>
          </div>
          {form.kind === 'promo' && form.requirementKey === 'follow_team' && (
            <>
              <div>
                <label className="block text-sm text-gray-700">League</label>
                <select value={form.league || ''} onChange={(e) => setForm({ ...form, league: e.target.value })} className="mt-1 px-3 py-2 border rounded min-w-[12rem]">
                  <option value="">All</option>
                  {leagueOptions.map((lg) => (
                    <option key={lg} value={lg}>{lg.toUpperCase()}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-700">Team</label>
                <select
                  key={form.league || 'all'}
                  value={form.requirementTeamSlug || ''}
                  onChange={(e) => setForm({ ...form, requirementTeamSlug: e.target.value, redirectTeamSlug: e.target.value })}
                  className="mt-1 px-3 py-2 border rounded min-w-[16rem]"
                >
                  <option value="">Select team</option>
                  {(form.league ? teamOptions.filter(o => o.league === form.league) : teamOptions).map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-3 mt-1">
                <label className="inline-flex items-center text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={!!form.promoBonusEnabled}
                    onChange={(e) => setForm({ ...form, promoBonusEnabled: e.target.checked })}
                    className="mr-2"
                  />
                  Add Token Bonus
                </label>
                {form.promoBonusEnabled ? (
                  <input
                    type="number"
                    min={1}
                    value={form.promoBonusTokens}
                    onChange={(e) => setForm({ ...form, promoBonusTokens: e.target.value })}
                    className="px-3 py-2 border rounded w-28"
                    placeholder="Bonus"
                  />
                ) : null}
              </div>
            </>
          )}
          <div>
            <label className="block text-sm text-gray-700">Card Name</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1 px-3 py-2 border rounded" required />
          </div>
          {form.kind === 'award' && (
          <div>
            <label className="block text-sm text-gray-700">Token Bonus</label>
            <input type="number" min={1} value={form.tokens} onChange={(e) => setForm({ ...form, tokens: e.target.value })} className="mt-1 px-3 py-2 border rounded w-28" required />
          </div>
          )}
          <div>
            <label className="block text-sm text-gray-700">Custom Card Code (optional)</label>
            <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} className="mt-1 px-3 py-2 border rounded" placeholder="e.g. launch25" />
          </div>
          <div>
            <label className="block text-sm text-gray-700">Card Image</label>
            <div className="flex items-center gap-2 mt-1">
              <select
                value={form.imageMode || 'custom'}
                onChange={(e) => setForm({ ...form, imageMode: e.target.value })}
                className="px-2 py-2 border rounded"
              >
                <option value="custom">Custom Upload</option>
                <option value="team-logo" disabled={!(form.kind === 'promo' && form.requirementKey === 'follow_team')}>Use Team Logo (team)</option>
              </select>
              <input type="file" accept="image/*" disabled={form.imageMode === 'team-logo'} onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = async () => {
                  try {
                    const base64 = String(reader.result).split(',').pop();
                    // Client-side diagnostics
                    // eslint-disable-next-line no-console
                    console.log('[awards] uploading image', { name: file.name, size: file.size, type: file.type, base64Len: base64?.length });

                    const up = await fetch('/api/admin/uploadAwardImage', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ filename: file.name, fileData: base64 }),
                    });
                    let upJson = null;
                    try { upJson = await up.json(); } catch {}
                    // eslint-disable-next-line no-console
                    console.log('[awards] upload response', { ok: up.ok, status: up.status, json: upJson });

                    if (up.ok && upJson?.success) {
                      setForm((f) => ({ ...f, imageUrl: upJson.url }));
                    } else {
                      alert(upJson?.error || 'Upload failed');
                    }
                  } catch (err) {
                    // eslint-disable-next-line no-console
                    console.error('[awards] upload error', err);
                    alert('Upload failed');
                  }
                };
                reader.readAsDataURL(file);
              }} />
              {form.imageMode !== 'team-logo' && form.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={form.imageUrl} alt="preview" className="h-10 w-10 object-cover rounded" />
              ) : null}
              {form.imageMode === 'team-logo' && (form.kind === 'promo' && form.requirementKey === 'follow_team') ? (
                (() => {
                  const selected = teamOptions.find(o => o.value === form.requirementTeamSlug);
                  const logo = selected?.logoUrl || null;
                  return logo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={logo} alt="team logo" className="h-10 w-10 object-cover rounded" />
                  ) : (
                    <span className="text-xs text-gray-500">Select a team to preview its logo</span>
                  );
                })()
              ) : null}
            </div>
          </div>
          {(
            form.kind === 'award' || (form.kind === 'promo' && form.requirementKey === 'follow_series')
          ) && (
            <div className="flex flex-col gap-1">
              <label className="block text-sm text-gray-700">Requirement</label>
              <div className="grid grid-cols-1 gap-2">
                <select value={form.requirementKey} onChange={(e) => setForm({ ...form, requirementKey: e.target.value })} className="mt-1 px-3 py-2 border rounded min-w-[16rem]">
                  <option value="">None</option>
                  <option value="follow_team">Follow Team</option>
                  <option value="follow_series">Follow Series</option>
                </select>
                {form.requirementKey === 'follow_team' && (
                  <div className="flex items-center gap-2">
                    <select value={form.league || ''} onChange={(e) => setForm({ ...form, league: e.target.value })} className="mt-1 px-3 py-2 border rounded min-w-[12rem]">
                      <option value="">All</option>
                      {leagueOptions.map((lg) => (
                        <option key={lg} value={lg}>{lg.toUpperCase()}</option>
                      ))}
                    </select>
                    <select key={form.league || 'all'} value={form.requirementTeamSlug || ''} onChange={(e) => setForm({ ...form, requirementTeamSlug: e.target.value, redirectTeamSlug: e.target.value })} className="mt-1 px-3 py-2 border rounded min-w-[16rem]">
                      <option value="">Select team</option>
                      {(form.league ? teamOptions.filter(o => o.league === form.league) : teamOptions).map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                )}
                {form.requirementKey === 'follow_series' && (
                  <div className="flex items-center gap-2">
                    <select
                      value={form.requirementSeriesId || ''}
                      onChange={(e) => setForm({ ...form, requirementSeriesId: e.target.value })}
                      className="mt-1 px-3 py-2 border rounded min-w-[16rem]"
                    >
                      <option value="">Select series</option>
                      {seriesOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                    {seriesError ? <span className="text-xs text-red-600">{seriesError}</span> : null}
                  </div>
                )}
                {teamsError ? (
                  <p className="text-xs text-red-600 mt-1">{teamsError}</p>
                ) : null}
              </div>
            </div>
          )}
          <button type="submit" disabled={creating} className="px-3 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50">
            {creating ? 'Creating…' : 'Create'}
          </button>
        </form>
      </section>

      <section className="border rounded-lg p-4">
        <h2 className="text-lg font-semibold mb-3">Recent Promo Cards</h2>
        {loading ? (
          <p>Loading…</p>
        ) : error ? (
          <p className="text-red-600">{error}</p>
        ) : awards.length === 0 ? (
          <p>No promo cards yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left border-b">
                  <th className="py-2 pr-4">Card Code</th>
                  <th className="py-2 pr-4">Card Name</th>
                  <th className="py-2 pr-4">Token Bonus</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Requirement</th>
                  <th className="py-2 pr-4">Redeemed</th>
                  <th className="py-2 pr-4">Validity</th>
                  <th className="py-2 pr-4">Redirect Team</th>
                  <th className="py-2 pr-4">Card Image</th>
                  <th className="py-2 pr-4">Share</th>
                  <th className="py-2 pr-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {awards.map((a) => (
                  <tr key={a.code} className="border-b last:border-b-0">
                    <td className="py-2 pr-4 font-mono">{a.code}</td>
                    <td className="py-2 pr-4">{a.name}</td>
                    <td className="py-2 pr-4">{a.tokens}</td>
                    <td className="py-2 pr-4">{a.status}</td>
                    <td className="py-2 pr-4 text-xs text-gray-700">{a.requirement_key === 'follow_team' ? `Follow ${a.requirement_team_slug || ''}` : '—'}</td>
                    <td className="py-2 pr-4">{a.redeemed_at ? new Date(a.redeemed_at).toLocaleString() : '-'}</td>
                    <td className="py-2 pr-4">{[a.valid_from, a.valid_to].filter(Boolean).length ? `${a.valid_from ? new Date(a.valid_from).toLocaleDateString() : ''} – ${a.valid_to ? new Date(a.valid_to).toLocaleDateString() : ''}` : 'Always'}</td>
                    <td className="py-2 pr-4">{a.redirect_team_slug || '-'}</td>
                    <td className="py-2 pr-4">
                      {a.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={a.image_url} alt="img" className="h-8 w-8 object-cover rounded" />
                      ) : '-'}
                    </td>
                    <td className="py-2 pr-4">
                      <div className="flex items-center gap-2">
                        <Link href={`/?card=${encodeURIComponent(a.code)}`} target="_blank" className="text-blue-600 hover:underline">Open</Link>
                        <button
                          onClick={() => {
                            const origin = typeof window !== 'undefined' ? window.location.origin : '';
                            const url = `${origin}/?card=${encodeURIComponent(a.code)}`;
                            if (navigator?.clipboard?.writeText) navigator.clipboard.writeText(url);
                            setCopiedCode(a.code);
                            setTimeout(() => setCopiedCode(''), 1500);
                          }}
                          disabled={copiedCode === a.code}
                          className={`px-2 py-1 rounded ${copiedCode === a.code ? 'bg-green-200' : 'bg-gray-200 hover:bg-gray-300'} disabled:opacity-60`}
                        >{copiedCode === a.code ? 'Link Copied' : 'Copy Link'}</button>
                      </div>
                    </td>
                    <td className="py-2 pr-4 flex items-center gap-2">
                      <select
                        onChange={(e) => {
                          const v = e.target.value;
                          try { window.__MTT_PREVIEW_STATE__ = v; } catch {}
                        }}
                        defaultValue="not_logged_not_following"
                        className="px-2 py-1 border rounded"
                        aria-label="Preview State"
                      >
                        <option value="not_logged_not_following">not logged in, not following</option>
                        <option value="logged_not_following">logged in, not following</option>
                        <option value="logged_following">logged in, following</option>
                      </select>
                      <button
                        onClick={() => {
                          const state = typeof window !== 'undefined' ? window.__MTT_PREVIEW_STATE__ : 'not_logged_not_following';
                          if (a.kind === 'promo') {
                            openModal('promoFollow', { code: a.code, previewState: state });
                            return;
                          }
                          openModal('awardClaim', { code: a.code, previewState: state });
                        }}
                        className="px-2 py-1 bg-blue-200 rounded hover:bg-blue-300"
                      >
                        Show Modal Preview
                      </button>
                      {a.status !== 'disabled' && (
                        <button onClick={() => setStatus(a.code, 'disabled')} className="px-2 py-1 bg-gray-200 rounded hover:bg-gray-300">Disable</button>
                      )}
                      {a.status !== 'available' && (
                        <button onClick={() => setStatus(a.code, 'available')} className="px-2 py-1 bg-green-200 rounded hover:bg-green-300">Enable</button>
                      )}
                    <button onClick={() => del(a.code)} className="px-2 py-1 bg-red-200 rounded hover:bg-red-300">Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {/* RequirementModal removed: inline controls handle requirements */}
    </div>
  );
}
 
