import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';

export default function EditTeam() {
  const router = useRouter();
  const { id } = router.query;
  const [form, setForm] = useState({ teamID: '', teamName: '', teamAbbreviation: '', teamLeague: '', teamLogoURL: '', teamHomeSide: null, teamAwaySide: null });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const res = await fetch(`/api/admin/teams/${encodeURIComponent(id)}`);
        const data = await res.json();
        if (!data.success) throw new Error(data.error || 'Failed to load');
        const t = data.team;
        const toSingle = (v) => Array.isArray(v) ? (v[0] || null) : (v || null);
        setForm({
          teamID: t.teamID || '',
          teamName: t.teamNameFull || t.teamName || '',
          teamAbbreviation: t.teamAbbreviation || '',
          teamLeague: t.teamLeague || '',
          teamLogoURL: t.teamLogoURL || '',
          teamHomeSide: toSingle(t.teamHomeSide),
          teamAwaySide: toSingle(t.teamAwaySide),
        });
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/teams/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to save');
      router.push('/admin/teams');
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleUploadSide(e, side) {
    const file = e.target.files?.[0];
    if (!file) return;
    setSaving(true);
    setError(null);
    try {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64data = String(reader.result).split(',')[1];
        const res = await fetch('/api/admin/uploadTeamSide', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename: file.name, fileData: base64data, teamRef: form.teamAbbreviation || form.teamID, side }),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error || 'Upload failed');
        const attachment = { url: data.url, filename: data.filename || file.name };
        if (side === 'home') {
          setForm((prev) => ({ ...prev, teamHomeSide: attachment }));
        } else {
          setForm((prev) => ({ ...prev, teamAwaySide: attachment }));
        }
      };
      reader.readAsDataURL(file);
    } catch (e2) {
      setError(e2.message);
    } finally {
      setSaving(false);
      e.target.value = '';
    }
  }

  async function handleDelete() {
    if (!confirm('Delete this team?')) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/teams/${encodeURIComponent(id)}`, { method: 'DELETE' });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to delete');
      router.push('/admin/teams');
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-4 max-w-xl">
      <h1 className="text-2xl font-bold mb-4">Edit Team</h1>
      {loading && <p>Loading…</p>}
      {error && <p className="text-red-600 mb-2">{error}</p>}
      {!loading && (
        <form onSubmit={handleSave} className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700">Team ID</label>
            <input className="mt-1 w-full border rounded px-3 py-2" value={form.teamID} onChange={(e) => setForm({ ...form, teamID: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Name</label>
            <input className="mt-1 w-full border rounded px-3 py-2" value={form.teamName} onChange={(e) => setForm({ ...form, teamName: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Slug/Abbreviation</label>
            <input className="mt-1 w-full border rounded px-3 py-2" value={form.teamAbbreviation} onChange={(e) => setForm({ ...form, teamAbbreviation: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">League</label>
            <input className="mt-1 w-full border rounded px-3 py-2" value={form.teamLeague} onChange={(e) => setForm({ ...form, teamLeague: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Logo URL</label>
            <input className="mt-1 w-full border rounded px-3 py-2" value={form.teamLogoURL} onChange={(e) => setForm({ ...form, teamLogoURL: e.target.value })} />
          </div>
          <div className="pt-2 border-t mt-4">
            <h2 className="text-lg font-semibold mb-2">Home Side Attachments</h2>
            <div className="flex items-center gap-3 mb-2">
              <input type="file" accept="image/*" onChange={(e) => handleUploadSide(e, 'home')} />
            </div>
            <div className="flex flex-wrap gap-2">
              {form.teamHomeSide ? (
                <img src={form.teamHomeSide.url} alt={form.teamHomeSide.filename || 'home side'} className="w-16 h-16 object-contain border rounded" />
              ) : null}
            </div>
          </div>
          <div className="pt-2">
            <h2 className="text-lg font-semibold mb-2">Away Side Attachments</h2>
            <div className="flex items-center gap-3 mb-2">
              <input type="file" accept="image/*" onChange={(e) => handleUploadSide(e, 'away')} />
            </div>
            <div className="flex flex-wrap gap-2">
              {form.teamAwaySide ? (
                <img src={form.teamAwaySide.url} alt={form.teamAwaySide.filename || 'away side'} className="w-16 h-16 object-contain border rounded" />
              ) : null}
            </div>
          </div>
          <div className="pt-2 flex items-center gap-2">
            <button disabled={saving} className="px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">{saving ? 'Saving…' : 'Save'}</button>
            <button type="button" onClick={handleDelete} disabled={saving} className="px-3 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50">Delete</button>
          </div>
        </form>
      )}
    </div>
  );
}


