import { useEffect, useState } from 'react';
import Link from 'next/link';

export default function AwardsAdminPage() {
  const [awards, setAwards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [form, setForm] = useState({ name: '', tokens: 25, code: '', redirectTeamSlug: '', imageUrl: '' });
  const [creating, setCreating] = useState(false);
  const [teamOptions, setTeamOptions] = useState([]);
  const [teamsLoading, setTeamsLoading] = useState(false);
  const [teamsError, setTeamsError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/awards/list');
      const data = await res.json();
      if (res.ok && data.success) {
        setAwards(data.awards || []);
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
              const value = String(t.teamAbbreviation || t.teamSlug || '').toLowerCase();
              const label = String(t.teamNameFull || t.teamName || value || 'Team');
              return value ? { value, label } : null;
            })
            .filter(Boolean)
            .sort((a, b) => a.label.localeCompare(b.label));
          setTeamOptions(options);
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

  const create = async (e) => {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await fetch('/api/admin/awards/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: form.name, tokens: Number(form.tokens), code: form.code || undefined, redirectTeamSlug: form.redirectTeamSlug || undefined, imageUrl: form.imageUrl || undefined }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setForm({ name: '', tokens: 25, code: '', redirectTeamSlug: '', imageUrl: '' });
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
        <h1 className="text-2xl font-bold">Awards</h1>
        <Link href="/admin" className="text-blue-600 hover:underline">Back to Admin</Link>
      </div>

      <section className="border rounded-lg p-4 mb-6">
        <h2 className="text-lg font-semibold mb-3">Create Award</h2>
        <form onSubmit={create} className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-sm text-gray-700">Name</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1 px-3 py-2 border rounded" required />
          </div>
          <div>
            <label className="block text-sm text-gray-700">Tokens</label>
            <input type="number" min={1} value={form.tokens} onChange={(e) => setForm({ ...form, tokens: e.target.value })} className="mt-1 px-3 py-2 border rounded w-28" required />
          </div>
          <div>
            <label className="block text-sm text-gray-700">Custom Code (optional)</label>
            <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} className="mt-1 px-3 py-2 border rounded" placeholder="e.g. launch25" />
          </div>
          <div>
            <label className="block text-sm text-gray-700">Image</label>
            <div className="flex items-center gap-2 mt-1">
              <input type="file" accept="image/*" onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = async () => {
                  try {
                    const base64 = String(reader.result).split(',').pop();
                    const up = await fetch('/api/admin/uploadAwardImage', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ filename: file.name, fileData: base64 }),
                    });
                    const upJson = await up.json();
                    if (up.ok && upJson?.success) {
                      setForm((f) => ({ ...f, imageUrl: upJson.url }));
                    } else {
                      alert(upJson?.error || 'Upload failed');
                    }
                  } catch (err) {
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
          <div>
            <label className="block text-sm text-gray-700">Redirect Team</label>
            <select
              value={form.redirectTeamSlug}
              onChange={(e) => setForm({ ...form, redirectTeamSlug: e.target.value })}
              className="mt-1 px-3 py-2 border rounded min-w-[16rem]"
              disabled={teamsLoading}
            >
              <option value="">None</option>
              {teamOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
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
        <h2 className="text-lg font-semibold mb-3">Recent Awards</h2>
        {loading ? (
          <p>Loading…</p>
        ) : error ? (
          <p className="text-red-600">{error}</p>
        ) : awards.length === 0 ? (
          <p>No awards yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left border-b">
                  <th className="py-2 pr-4">Code</th>
                  <th className="py-2 pr-4">Name</th>
                  <th className="py-2 pr-4">Tokens</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Redeemed</th>
                  <th className="py-2 pr-4">Valid</th>
                  <th className="py-2 pr-4">Redirect</th>
                  <th className="py-2 pr-4">Image</th>
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
                          }}
                          className="px-2 py-1 bg-gray-200 rounded hover:bg-gray-300"
                        >Copy Link</button>
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
    </div>
  );
}


