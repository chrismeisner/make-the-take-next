import { useRouter } from 'next/router';
import { useState } from 'react';

export default function NewTeam() {
  const router = useRouter();
  const [form, setForm] = useState({ teamID: '', teamName: '', teamAbbreviation: '', teamLeague: '', teamLogoURL: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to create');
      router.push('/admin/teams');
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-4 max-w-xl">
      <h1 className="text-2xl font-bold mb-4">New Team</h1>
      {error && <p className="text-red-600 mb-2">{error}</p>}
      <form onSubmit={handleSubmit} className="space-y-3">
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
        <div className="pt-2">
          <button disabled={saving} className="px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">{saving ? 'Saving…' : 'Create Team'}</button>
        </div>
      </form>
    </div>
  );
}


