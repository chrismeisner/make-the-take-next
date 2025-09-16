import { useEffect, useState } from 'react';
import Link from 'next/link';

export default function AdminPromoLinksPage() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ key: '', param_key: 'packs', destination_url: '', notes: '', active: true, priority: 0, expires_at: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/promo-links');
      const data = await res.json();
      if (data.success) setRecords(data.records || []);
      else setError(data.error || 'Failed to load');
    } catch (e) {
      setError(e?.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = { ...form };
      if (!payload.expires_at) delete payload.expires_at;
      const res = await fetch('/api/admin/promo-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Save failed');
      setForm({ key: '', destination_url: '', notes: '', active: true, priority: 0, expires_at: '' });
      await load();
    } catch (e) {
      setError(e?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Promo Links</h1>
        <Link href="/admin">
          <span className="text-blue-600 underline">Back to Admin</span>
        </Link>
      </div>
      <form onSubmit={handleSubmit} className="mb-6 p-4 border rounded">
        <h2 className="text-lg font-semibold mb-3">Create / Update</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium">Param</label>
            <select
              className="mt-1 w-full border rounded px-2 py-1"
              value={form.param_key}
              onChange={(e) => setForm({ ...form, param_key: e.target.value })}
            >
              <option value="packs">packs</option>
              <option value="team">team</option>
              <option value="promo">promo</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium">Key</label>
            <input className="mt-1 w-full border rounded px-2 py-1" value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value })} placeholder="phillies" required />
            <p className="text-xs text-gray-500 mt-1">URL example: https://yoursite.com/?{form.param_key || 'packs'}={form.key || 'phillies'}</p>
          </div>
          <div>
            <label className="block text-sm font-medium">Destination URL</label>
            <input className="mt-1 w-full border rounded px-2 py-1" value={form.destination_url} onChange={(e) => setForm({ ...form, destination_url: e.target.value })} placeholder="/packs/some-pack" required />
          </div>
          <div>
            <label className="block text-sm font-medium">Notes</label>
            <input className="mt-1 w-full border rounded px-2 py-1" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm font-medium">Priority</label>
            <input type="number" className="mt-1 w-full border rounded px-2 py-1" value={form.priority} onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })} />
          </div>
          <div className="flex items-center gap-2">
            <input id="active" type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
            <label htmlFor="active" className="text-sm">Active</label>
          </div>
          <div>
            <label className="block text-sm font-medium">Expires At (optional)</label>
            <input type="datetime-local" className="mt-1 w-full border rounded px-2 py-1" value={form.expires_at} onChange={(e) => setForm({ ...form, expires_at: e.target.value })} />
          </div>
        </div>
        {error && <p className="text-red-600 mt-2">{error}</p>}
        <button type="submit" disabled={saving} className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
          {saving ? 'Saving…' : 'Save'}
        </button>
      </form>

      <div className="overflow-x-auto">
        <table className="min-w-full bg-white">
          <thead>
            <tr>
              <th className="px-4 py-2 border">Key</th>
              <th className="px-4 py-2 border">Destination</th>
              <th className="px-4 py-2 border">Active</th>
              <th className="px-4 py-2 border">Priority</th>
              <th className="px-4 py-2 border">Clicks</th>
              <th className="px-4 py-2 border">Updated</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="px-4 py-2 border" colSpan={6}>Loading…</td></tr>
            ) : (
              records.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-2 border">
                    <div className="flex items-center gap-2">
                      <code className="bg-gray-100 px-2 py-1 rounded">{r.key}</code>
                      <button
                        className="text-blue-600 underline text-sm"
                        onClick={() => setForm({
                          key: r.key,
                          param_key: r.param_key || 'packs',
                          destination_url: r.destination_url,
                          notes: r.notes || '',
                          active: r.active,
                          priority: r.priority || 0,
                          expires_at: r.expires_at ? new Date(r.expires_at).toISOString().slice(0,16) : '',
                        })}
                      >Edit</button>
                    </div>
                    <div className="text-xs text-gray-500">/?{r.param_key || 'packs'}={r.key}</div>
                  </td>
                  <td className="px-4 py-2 border">{r.destination_url}</td>
                  <td className="px-4 py-2 border">{r.active ? 'Yes' : 'No'}</td>
                  <td className="px-4 py-2 border">{r.priority}</td>
                  <td className="px-4 py-2 border">{r.clicks}</td>
                  <td className="px-4 py-2 border">{r.updated_at ? new Date(r.updated_at).toLocaleString() : '-'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}


