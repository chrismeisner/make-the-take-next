import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import GlobalModal from '../../components/modals/GlobalModal';

export default function AwardsAdminPage() {
  const [awards, setAwards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [form, setForm] = useState({ name: '', tokens: 25, code: '', redirectTeamSlug: '', imageUrl: '', requirementKey: '', requirementTeamSlug: '' });
  const [creating, setCreating] = useState(false);
  const [teamOptions, setTeamOptions] = useState([]);
  const [leagueOptions, setLeagueOptions] = useState([]);
  const [teamsLoading, setTeamsLoading] = useState(false);
  const [teamsError, setTeamsError] = useState('');
  const [requirementModalOpen, setRequirementModalOpen] = useState(false);
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
              return rawSlug ? { value: rawSlug, label, league } : null;
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

  // Keep options in memory; selection happens inside modal

  const create = async (e) => {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await fetch('/api/admin/awards/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: form.name, tokens: Number(form.tokens), code: form.code || undefined, redirectTeamSlug: form.redirectTeamSlug || undefined, imageUrl: form.imageUrl || undefined, requirementKey: form.requirementKey || undefined, requirementTeamSlug: form.requirementTeamSlug || undefined }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setForm({ name: '', tokens: 25, code: '', redirectTeamSlug: '', imageUrl: '', requirementKey: '', requirementTeamSlug: '' });
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
        <p className="text-sm text-gray-600 mb-3">Promo Cards are unique shareable cards that, when opened by a fan, grant a one-time marketplace token bonus to that fan's account.</p>
        <form onSubmit={create} className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-sm text-gray-700">Card Name</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1 px-3 py-2 border rounded" required />
          </div>
          <div>
            <label className="block text-sm text-gray-700">Token Bonus</label>
            <input type="number" min={1} value={form.tokens} onChange={(e) => setForm({ ...form, tokens: e.target.value })} className="mt-1 px-3 py-2 border rounded w-28" required />
          </div>
          <div>
            <label className="block text-sm text-gray-700">Custom Card Code (optional)</label>
            <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} className="mt-1 px-3 py-2 border rounded" placeholder="e.g. launch25" />
          </div>
          <div>
            <label className="block text-sm text-gray-700">Card Image</label>
            <div className="flex items-center gap-2 mt-1">
              <input type="file" accept="image/*" onChange={async (e) => {
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
              {form.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={form.imageUrl} alt="preview" className="h-10 w-10 object-cover rounded" />
              ) : null}
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label className="block text-sm text-gray-700">Requirement</label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setRequirementModalOpen(true)}
                className="mt-1 px-3 py-2 bg-gray-100 rounded hover:bg-gray-200"
              >{form.requirementKey ? 'Edit requirement' : 'Add requirement'}</button>
              {form.requirementKey ? (
                <span className="text-sm text-gray-700">
                  {form.requirementKey === 'follow_team' ? (
                    <>Follow team: <span className="font-medium">{form.requirementTeamSlug || '—'}</span></>
                  ) : '—'}
                  {form.redirectTeamSlug ? (
                    <> • Redirect: <span className="font-medium">{form.redirectTeamSlug}</span></>
                  ) : null}
                </span>
              ) : (
                <span className="text-sm text-gray-500">None</span>
              )}
            </div>
            {teamsError ? (
              <p className="text-xs text-red-600 mt-1">{teamsError}</p>
            ) : null}
          </div>
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
                    <td className="py-2 pr-4 flex gap-2">
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
      <RequirementModal
        isOpen={requirementModalOpen}
        onClose={() => setRequirementModalOpen(false)}
        options={teamOptions}
        leagues={leagueOptions}
        initial={{ requirementKey: form.requirementKey, requirementTeamSlug: form.requirementTeamSlug, redirectTeamSlug: form.redirectTeamSlug }}
        onSave={({ requirementKey, requirementTeamSlug, redirectTeamSlug }) => {
          setForm((f) => ({ ...f, requirementKey, requirementTeamSlug, redirectTeamSlug }));
          setRequirementModalOpen(false);
        }}
      />
    </div>
  );
}

function RequirementModal({ isOpen, onClose, options, leagues, initial, onSave }) {
  const [requirementKey, setRequirementKey] = useState(initial?.requirementKey || '');
  const [league, setLeague] = useState(initial?.league || '');
  const [requiredTeamSlug, setRequiredTeamSlug] = useState(initial?.requirementTeamSlug || initial?.redirectTeamSlug || '');
  // When opening with a preselected team, auto-select its league for consistent filtering
  useEffect(() => {
    if (!league && requiredTeamSlug) {
      const match = options.find((o) => o.value === requiredTeamSlug);
      if (match?.league) setLeague(match.league);
    }
  }, [options, requiredTeamSlug, league]);
  // If league changes and the selected team is not in that league, clear the team selection
  useEffect(() => {
    if (!league) return;
    if (requiredTeamSlug && !options.some((o) => o.value === requiredTeamSlug && o.league === league)) {
      setRequiredTeamSlug('');
    }
  }, [league, options, requiredTeamSlug]);
  const filtered = useMemo(() => (league ? options.filter(o => o.league === league) : options), [options, league]);
  return (
    <GlobalModal isOpen={isOpen} onClose={onClose}>
      <div className="space-y-3">
        <h2 className="text-xl font-bold">Set Requirement</h2>
        <div>
          <label className="block text-sm text-gray-700">Requirement</label>
          <select value={requirementKey} onChange={(e) => setRequirementKey(e.target.value)} className="mt-1 px-3 py-2 border rounded min-w-[16rem]">
            <option value="">None</option>
            <option value="follow_team">Follow Team</option>
          </select>
        </div>
        {requirementKey === 'follow_team' && (
          <>
            <div>
              <label className="block text-sm text-gray-700">League</label>
              <select value={league} onChange={(e) => setLeague(e.target.value)} className="mt-1 px-3 py-2 border rounded min-w-[12rem]">
                <option value="">All</option>
                {leagues.map((lg) => (
                  <option key={lg} value={lg}>{lg.toUpperCase()}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-700">Team</label>
              <select key={league || 'all'} value={requiredTeamSlug} onChange={(e) => setRequiredTeamSlug(e.target.value)} className="mt-1 px-3 py-2 border rounded min-w-[16rem]">
                <option value="">Select team</option>
                {filtered.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </>
        )}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-2 bg-gray-100 rounded hover:bg-gray-200">Cancel</button>
          <button
            onClick={() => {
              onSave({ requirementKey, requirementTeamSlug: requiredTeamSlug, redirectTeamSlug: requiredTeamSlug });
            }}
            className="px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >Save</button>
        </div>
      </div>
    </GlobalModal>
  );
}


