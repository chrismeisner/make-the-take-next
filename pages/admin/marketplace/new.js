import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import { useState, useEffect } from 'react';

export default function NewMarketplaceItemPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    itemID: '',
    itemName: '',
    itemBrand: '',
    itemDescription: '',
    itemTokens: 0,
    itemStatus: 'Hidden',
    itemImage: '',
    featured: false,
    requireAddress: false,
  });
  // Team variations (queued for after create)
  const [varTeamLeague, setVarTeamLeague] = useState('');
  const [varTeamSlug, setVarTeamSlug] = useState('');
  const [varPriority, setVarPriority] = useState(0);
  const [varFile, setVarFile] = useState(null);
  const [varPreview, setVarPreview] = useState(null);
  const [queuedVariations, setQueuedVariations] = useState([]);
  const [teamOptions, setTeamOptions] = useState([]);
  const [leagueOptions, setLeagueOptions] = useState([]);

  // Load teams for dropdowns
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/teams');
        const data = await res.json();
        if (res.ok && data?.success) {
          const teams = Array.isArray(data.teams) ? data.teams : [];
          const filtered = teams.filter((t) => (String(t.teamType || '')).toLowerCase() !== 'league');
          const options = filtered
            .map((t) => {
              const value = String(t.teamSlug || '').toLowerCase();
              const league = String(t.teamLeague || t.teamType || t.league || '').toLowerCase();
              const label = String(t.teamNameFull || t.teamName || value || 'Team');
              return value ? { value, label, league } : null;
            })
            .filter(Boolean)
            .sort((a, b) => a.label.localeCompare(b.label));
          setTeamOptions(options);
          const leagues = Array.from(new Set(options.map(o => o.league).filter(Boolean))).sort();
          setLeagueOptions(leagues);
        }
      } catch {}
    })();
  }, []);

  const STATUS_OPTIONS = ['Available', 'Sold Out', 'Hidden'];

  if (status === 'loading') return <div className="container mx-auto px-4 py-6">Loading…</div>;
  if (!session) return <div className="container mx-auto px-4 py-6">Not authorized</div>;

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = { ...form };
      const res = await fetch('/api/admin/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        // If queued team variations exist, upload images and POST them
        const newId = data.itemID;
        for (const v of queuedVariations) {
          let imageUrl = v.imageUrl || '';
          if (v.file && v.preview) {
            const toBase64 = (f) => new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.readAsDataURL(f);
              reader.onload = () => resolve(reader.result.split(',')[1]);
              reader.onerror = (err) => reject(err);
            });
            const base64Data = await toBase64(v.file);
            const uploadRes = await fetch('/api/admin/uploadItemImage', {
              method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filename: v.file.name, fileData: base64Data })
            });
            const uploadData = await uploadRes.json();
            if (uploadRes.ok && uploadData?.success) imageUrl = uploadData.url; else throw new Error(uploadData?.error || 'Upload failed');
          }
          await fetch(`/api/admin/items/${encodeURIComponent(newId)}/team-images`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ teamSlug: v.teamSlug, imageUrl, priority: v.priority || 0 })
          });
        }
        router.push('/admin/marketplace');
      } else {
        setError(data.error || 'Failed to create item');
      }
    } catch (e) {
      setError('Error creating item');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="container mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold mb-4">New Item</h1>
      <form onSubmit={handleSave} className="space-y-4 max-w-2xl">
        {error && <div className="text-red-600">{error}</div>}
        <div>
          <label className="block text-sm font-medium text-gray-700">Item ID (optional)</label>
          <input
            type="text"
            value={form.itemID}
            onChange={(e) => setForm({ ...form, itemID: e.target.value })}
            className="mt-1 block w-full rounded border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            placeholder="auto-derived from name if blank"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Title</label>
          <input
            type="text"
            value={form.itemName}
            onChange={(e) => setForm({ ...form, itemName: e.target.value })}
            className="mt-1 block w-full rounded border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Brand</label>
          <input
            type="text"
            value={form.itemBrand}
            onChange={(e) => setForm({ ...form, itemBrand: e.target.value })}
            className="mt-1 block w-full rounded border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Description</label>
          <textarea
            value={form.itemDescription}
            onChange={(e) => setForm({ ...form, itemDescription: e.target.value })}
            className="mt-1 block w-full rounded border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            rows={4}
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Tokens</label>
            <input
              type="number"
              min={0}
              value={form.itemTokens}
              onChange={(e) => setForm({ ...form, itemTokens: Number(e.target.value) })}
              className="mt-1 block w-full rounded border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Status</label>
            <select
              value={form.itemStatus || ''}
              onChange={(e) => setForm({ ...form, itemStatus: e.target.value })}
              className="mt-1 block w-full rounded border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              required
            >
              <option value="" disabled>Select status</option>
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2 mt-6">
            <input
              id="featured"
              type="checkbox"
              checked={form.featured}
              onChange={(e) => setForm({ ...form, featured: e.target.checked })}
              className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <label htmlFor="featured" className="text-sm text-gray-700">Featured</label>
          </div>
          <div className="flex items-center gap-2 mt-6">
            <input
              id="requireAddress"
              type="checkbox"
              checked={form.requireAddress}
              onChange={(e) => setForm({ ...form, requireAddress: e.target.checked })}
              className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <label htmlFor="requireAddress" className="text-sm text-gray-700">Require Address on Redeem</label>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Image URL</label>
          <input
            type="url"
            value={form.itemImage}
            onChange={(e) => setForm({ ...form, itemImage: e.target.value })}
            className="mt-1 block w-full rounded border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            placeholder="https://..."
          />
        </div>
      {/* Team Variations (optional, queued until after create) */}
      <div className="mt-6 p-3 border rounded bg-gray-50">
        <div className="font-medium mb-2">Team Variations (optional)</div>
        {queuedVariations.length > 0 && (
          <div className="overflow-x-auto mb-3">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left border-b">
                  <th className="py-2 pr-4">Team</th>
                  <th className="py-2 pr-4">Image</th>
                  <th className="py-2 pr-4">Priority</th>
                  <th className="py-2 pr-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {queuedVariations.map((v, idx) => (
                  <tr key={`${v.teamSlug}-${idx}`} className="border-b">
                    <td className="py-2 pr-4">{v.teamSlug}</td>
                    <td className="py-2 pr-4">{v.preview ? (<img src={v.preview} alt="preview" className="h-10 w-10 object-cover rounded" />) : '-'}</td>
                    <td className="py-2 pr-4">{v.priority || 0}</td>
                    <td className="py-2 pr-4">
                      <button type="button" className="px-2 py-1 bg-red-200 rounded hover:bg-red-300" onClick={() => setQueuedVariations(prev => prev.filter((x, i) => i !== idx))}>Remove</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
          <div>
            <label className="block text-xs text-gray-700">League</label>
            <select value={varTeamLeague} onChange={(e) => { setVarTeamLeague(e.target.value); setVarTeamSlug(''); }} className="mt-1 px-2 py-1 border rounded w-full">
              <option value="">Select league</option>
              {leagueOptions.map((lg) => (<option key={lg} value={lg}>{lg.toUpperCase()}</option>))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-700">Team</label>
            <select key={varTeamLeague || 'all'} value={varTeamSlug} onChange={(e) => setVarTeamSlug(e.target.value)} className="mt-1 px-2 py-1 border rounded w-full">
              <option value="">Select team</option>
              {(varTeamLeague ? teamOptions.filter(o => o.league === varTeamLeague) : teamOptions).map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-700">Priority</label>
            <input type="number" value={varPriority} onChange={(e) => setVarPriority(Number(e.target.value)||0)} className="mt-1 px-2 py-1 border rounded w-full" />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs text-gray-700">Image</label>
            <div className="flex items-center gap-2 mt-1">
              <input type="file" accept="image/*" onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) { setVarFile(null); setVarPreview(null); return; }
                setVarFile(f);
                const reader = new FileReader();
                reader.onload = () => setVarPreview(reader.result);
                reader.readAsDataURL(f);
              }} />
              {varPreview ? (<img src={varPreview} alt="preview" className="h-10 w-10 object-cover rounded" />) : null}
            </div>
          </div>
        </div>
        <div className="mt-2">
          <button type="button" className="px-3 py-2 bg-green-600 text-white rounded hover:bg-green-700" onClick={() => {
            if (!varTeamSlug) return;
            setQueuedVariations(prev => [...prev, { teamSlug: varTeamSlug, priority: varPriority, file: varFile, preview: varPreview }]);
            setVarTeamLeague(''); setVarTeamSlug(''); setVarPriority(0); setVarFile(null); setVarPreview(null);
          }}>Queue Variation</button>
        </div>
      </div>
        <div className="pt-2">
          <button
            type="submit"
            disabled={saving}
            className={`px-4 py-2 rounded text-white ${saving ? 'bg-gray-400' : 'bg-blue-600 hover:bg-blue-700'}`}
          >
            {saving ? 'Creating…' : 'Create'}
          </button>
          <button
            type="button"
            onClick={() => router.push('/admin/marketplace')}
            className="ml-3 px-4 py-2 rounded border"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}


export async function getServerSideProps() {
  return { props: {} };
}


