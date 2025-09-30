import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';

export default function AdminSeriesEdit() {
  const router = useRouter();
  const { seriesID } = router.query;
  const [record, setRecord] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [packs, setPacks] = useState([]);
  const [packURLsCsv, setPackURLsCsv] = useState('');
  const [uploading, setUploading] = useState(false);
  const [coverPreview, setCoverPreview] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [allPacks, setAllPacks] = useState([]);
  const [selected, setSelected] = useState({});

  useEffect(() => {
    if (!seriesID) return;
    let mounted = true;
    async function load() {
      setLoading(true);
      setError('');
      try {
        const [res, resP] = await Promise.all([
          fetch(`/api/admin/series/${seriesID}`),
          fetch(`/api/admin/series/${seriesID}/packs`),
        ]);
        const data = await res.json();
        const dataP = await resP.json();
        if (!res.ok || !data.success) throw new Error(data.error || 'Failed to load');
        if (!resP.ok || !dataP.success) throw new Error(dataP.error || 'Failed to load packs');
        if (mounted) {
          setRecord(data.record);
          setPacks(dataP.packs || []);
          setPackURLsCsv((dataP.packs || []).map((p) => p.pack_url).join(','));
        }
      } catch (e) {
        if (mounted) setError(e.message);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => { mounted = false; };
  }, [seriesID]);

  const onSaveMeta = async (e) => {
    e.preventDefault();
    if (!record) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/admin/series/${seriesID}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: record.title, summary: record.summary, coverUrl: record.cover_url, status: record.status }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to save');
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const onSavePacks = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const urls = packURLsCsv.split(',').map((s) => s.trim()).filter(Boolean);
      const res = await fetch(`/api/admin/series/${seriesID}/packs`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packURLs: urls }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to save packs');
      // Reload packs list
      const resP = await fetch(`/api/admin/series/${seriesID}/packs`);
      const dataP = await resP.json();
      setPacks(dataP.packs || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const openAddPacks = async () => {
    setShowModal(true);
    setError('');
    try {
      const res = await fetch('/api/packs?includeAll=1');
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to load packs');
      setAllPacks(data.packs || []);
      const curr = new Set(packs.map((p) => p.pack_url));
      const initialSel = {};
      (data.packs || []).forEach((p) => { initialSel[p.packURL] = curr.has(p.packURL); });
      setSelected(initialSel);
    } catch (e) {
      setError(e.message);
    }
  };

  const saveModalSelection = async () => {
    const urls = Object.entries(selected).filter(([, v]) => v).map(([k]) => k);
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/admin/series/${seriesID}/packs`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packURLs: urls }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to save packs');
      const resP = await fetch(`/api/admin/series/${seriesID}/packs`);
      const dataP = await resP.json();
      setPacks(dataP.packs || []);
      setPackURLsCsv((dataP.packs || []).map((p) => p.pack_url).join(','));
      setShowModal(false);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-6">Loading…</div>;
  if (error) return <div className="p-6 text-red-600">{error}</div>;
  if (!record) return <div className="p-6">Not found</div>;

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Edit Series</h1>

      <form onSubmit={onSaveMeta} className="border rounded p-4 space-y-3 bg-white">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <input className="border p-2 rounded" placeholder="Title" value={record.title || ''} onChange={(e) => setRecord({ ...record, title: e.target.value })} />
          <div className="flex flex-col gap-2">
            <input className="border p-2 rounded" placeholder="Cover URL" value={record.cover_url || ''} onChange={(e) => setRecord({ ...record, cover_url: e.target.value })} />
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
                      setRecord(prev => ({ ...prev, cover_url: data.url }));
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
              {(coverPreview || record.cover_url) && (
                <img src={coverPreview || record.cover_url} alt="preview" className="h-12 w-12 object-cover rounded" />
              )}
            </div>
          </div>
          <input className="border p-2 rounded" placeholder="Status" value={record.status || ''} onChange={(e) => setRecord({ ...record, status: e.target.value })} />
          <textarea className="border p-2 rounded md:col-span-2" placeholder="Summary" value={record.summary || ''} onChange={(e) => setRecord({ ...record, summary: e.target.value })} />
        </div>
        <button disabled={saving} className="px-4 py-2 bg-blue-600 text-white rounded">{saving ? 'Saving…' : 'Save'}</button>
    </form>

      <div className="border rounded p-4 space-y-3 bg-white">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Packs in Series</h2>
          <button onClick={openAddPacks} className="px-3 py-1.5 bg-green-600 text-white rounded">Add Packs</button>
        </div>
        <div className="overflow-auto border rounded">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left p-2">Title</th>
                <th className="text-left p-2">Pack URL</th>
                <th className="text-left p-2">Status</th>
                <th className="text-left p-2">Created</th>
              </tr>
            </thead>
            <tbody>
              {packs.map((p) => (
                <tr key={p.id} className="border-t">
                  <td className="p-2">{p.title}</td>
                  <td className="p-2 text-gray-600">{p.pack_url}</td>
                  <td className="p-2">{p.pack_status || ''}</td>
                  <td className="p-2">{p.created_at ? new Date(p.created_at).toLocaleString() : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <form onSubmit={onSavePacks} className="space-y-2">
          <label className="text-sm text-gray-700">Pack URLs (comma-separated)</label>
          <textarea className="border p-2 rounded w-full" rows={3} value={packURLsCsv} onChange={(e) => setPackURLsCsv(e.target.value)} />
          <button disabled={saving} className="px-4 py-2 bg-blue-600 text-white rounded">{saving ? 'Saving…' : 'Save Pack Membership'}</button>
        </form>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white w-full max-w-3xl rounded shadow-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold">Add Packs to Series</h3>
              <button onClick={() => setShowModal(false)} className="text-gray-600">✕</button>
            </div>
            <div className="max-h-[60vh] overflow-auto border rounded">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="p-2">Add</th>
                    <th className="text-left p-2">Title</th>
                    <th className="text-left p-2">Pack URL</th>
                    <th className="text-left p-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {allPacks.map((p) => (
                    <tr key={p.packURL} className="border-t">
                      <td className="p-2 text-center">
                        <input
                          type="checkbox"
                          checked={!!selected[p.packURL]}
                          onChange={(e) => setSelected({ ...selected, [p.packURL]: e.target.checked })}
                        />
                      </td>
                      <td className="p-2">{p.packTitle}</td>
                      <td className="p-2 text-gray-600">{p.packURL}</td>
                      <td className="p-2">{p.packStatus}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button onClick={() => setShowModal(false)} className="px-3 py-1.5 rounded border">Cancel</button>
              <button onClick={saveModalSelection} disabled={saving} className="px-3 py-1.5 rounded bg-blue-600 text-white">{saving ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


