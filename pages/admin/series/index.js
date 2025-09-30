import { useEffect, useState } from 'react';
import Link from 'next/link';

export default function AdminSeriesIndex() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ seriesID: '', title: '', summary: '', coverUrl: '', status: '' });
  const [coverPreview, setCoverPreview] = useState('');
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      setError('');
      try {
        const res = await fetch('/api/admin/series');
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || 'Failed to load');
        if (mounted) setList(data.series || []);
      } catch (e) {
        if (mounted) setError(e.message);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => { mounted = false; };
  }, []);

  const onCreate = async (e) => {
    e.preventDefault();
    setCreating(true);
    setError('');
    try {
      const res = await fetch('/api/admin/series', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to create');
      // Reload list
      const res2 = await fetch('/api/admin/series');
      const data2 = await res2.json();
      setList(data2.series || []);
      setForm({ seriesID: '', title: '', summary: '', coverUrl: '', status: '' });
    } catch (e) {
      setError(e.message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Series</h1>

      <form onSubmit={onCreate} className="border rounded p-4 space-y-3 bg-white">
        <h2 className="text-xl font-semibold">Create or Update Series</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="flex gap-2">
            <input className="border p-2 rounded flex-1" placeholder="seriesID (slug)" value={form.seriesID} onChange={(e) => setForm({ ...form, seriesID: e.target.value })} />
            <button type="button" className="px-2 py-1 border rounded" onClick={() => {
              const slug = (form.title || '').toLowerCase().trim().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-');
              setForm({ ...form, seriesID: slug });
            }}>Generate</button>
          </div>
          <input className="border p-2 rounded" placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <div className="flex flex-col gap-2">
            <input className="border p-2 rounded" placeholder="Cover URL" value={form.coverUrl} onChange={(e) => setForm({ ...form, coverUrl: e.target.value })} />
            <div className="flex items-center gap-2">
              <input type="file" accept="image/*" onChange={async (e) => {
                const file = e.target.files && e.target.files[0];
                if (!file) return;
                setUploading(true);
                setCoverPreview(URL.createObjectURL(file));
                try {
                  const reader = new FileReader();
                  reader.readAsDataURL(file);
                  reader.onloadend = async () => {
                    const base64data = reader.result.split(',')[1];
                    const res = await fetch('/api/admin/uploadSeriesCover', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ filename: file.name, fileData: base64data }),
                    });
                    const data = await res.json();
                    if (res.ok && data.success) {
                      setForm(prev => ({ ...prev, coverUrl: data.url }));
                    } else {
                      alert(data.error || 'Upload failed');
                    }
                    setUploading(false);
                  };
                } catch (err) {
                  setUploading(false);
                  alert(err?.message || 'Upload failed');
                }
              }} />
              {uploading && <span className="text-sm text-gray-600">Uploading…</span>}
              {(coverPreview || form.coverUrl) && (
                <img src={coverPreview || form.coverUrl} alt="preview" className="h-12 w-12 object-cover rounded" />
              )}
            </div>
          </div>
          <input className="border p-2 rounded" placeholder="Status (optional)" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} />
          <textarea className="border p-2 rounded md:col-span-2" placeholder="Summary" value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} />
        </div>
        <button disabled={creating} className="px-4 py-2 bg-blue-600 text-white rounded">
          {creating ? 'Saving…' : 'Save Series'}
        </button>
        {error ? <p className="text-red-600 text-sm">{error}</p> : null}
      </form>

      <div className="border rounded p-4 bg-white">
        <h2 className="text-xl font-semibold mb-3">All Series</h2>
        {loading ? (
          <p>Loading…</p>
        ) : error ? (
          <p className="text-red-600">{error}</p>
        ) : (
          <ul className="divide-y">
            {list.map((s) => (
              <li key={s.id} className="py-3 flex items-center justify-between">
                <div>
                  <div className="font-medium">{s.title || s.series_id || s.id}</div>
                  <div className="text-sm text-gray-600">{s.series_id}</div>
                </div>
                <div className="flex items-center gap-3">
                  <Link className="text-blue-600 underline" href={`/admin/series/${s.series_id || s.id}`}>Edit</Link>
                  <Link className="text-gray-600 underline" href={`/series/${s.series_id || s.id}`}>View</Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}


