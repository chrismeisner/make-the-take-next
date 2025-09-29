import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';

export default function EditMarketplaceItemPage() {
  const router = useRouter();
  const { itemID } = router.query;
  const { data: session, status } = useSession();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    itemName: '',
    itemBrand: '',
    itemDescription: '',
    itemTokens: 0,
    itemStatus: '',
    itemImage: '',
    featured: false,
    requireAddress: false,
  });
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [inventory, setInventory] = useState(null);
  const [variations, setVariations] = useState([]);
  const [varsLoading, setVarsLoading] = useState(false);
  const [varsError, setVarsError] = useState('');
  const [varTeamLeague, setVarTeamLeague] = useState('');
  const [varTeamSlug, setVarTeamSlug] = useState('');
  const [varPriority, setVarPriority] = useState(0);
  const [varFile, setVarFile] = useState(null);
  const [varPreview, setVarPreview] = useState(null);
  const [varImageUrl, setVarImageUrl] = useState('');
  const [teamOptions, setTeamOptions] = useState([]);
  const [leagueOptions, setLeagueOptions] = useState([]);

  const STATUS_OPTIONS = ['Available', 'Sold Out', 'Hidden'];

  useEffect(() => {
    if (status !== 'authenticated') return;
    if (!itemID) return;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const res = await fetch(`/api/admin/items/${encodeURIComponent(itemID)}`);
        const data = await res.json();
        if (data.success) {
          const it = data.item || {};
          setForm({
            itemName: it.itemName || '',
            itemBrand: it.itemBrand || '',
            itemDescription: it.itemDescription || '',
            itemTokens: Number(it.itemTokens) || 0,
            itemStatus: it.itemStatus || '',
            itemImage: it.itemImage || '',
            featured: Boolean(it.featured),
            requireAddress: Boolean(it.requireAddress),
          });
          if (it.inventory) setInventory(it.inventory);
        } else {
          setError(data.error || 'Failed to load item');
        }
      } catch (e) {
        setError('Error loading item');
      } finally {
        setLoading(false);
      }
    })();
  }, [status, itemID]);

  // Load team variations
  useEffect(() => {
    if (status !== 'authenticated') return;
    if (!itemID) return;
    (async () => {
      setVarsLoading(true);
      setVarsError('');
      try {
        const res = await fetch(`/api/admin/items/${encodeURIComponent(itemID)}/team-images`);
        const data = await res.json();
        if (res.ok && data?.success) setVariations(Array.isArray(data.variations) ? data.variations : []);
        else setVarsError(data?.error || 'Failed to load team variations');
      } catch (e) {
        setVarsError('Error loading team variations');
      } finally {
        setVarsLoading(false);
      }
    })();
  }, [status, itemID]);

  // Load teams for dropdown
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

  if (status === 'loading') return <div className="container mx-auto px-4 py-6">Loading…</div>;
  if (!session) return <div className="container mx-auto px-4 py-6">Not authorized</div>;

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      // If a new image file was selected, upload it first
      let imageUrl = form.itemImage || '';
      if (file && preview) {
        const toBase64 = (f) => new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.readAsDataURL(f);
          reader.onload = () => resolve(reader.result.split(',')[1]);
          reader.onerror = (err) => reject(err);
        });
        const base64Data = await toBase64(file);
        const uploadRes = await fetch('/api/admin/uploadItemImage', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename: file.name, fileData: base64Data }),
        });
        const uploadData = await uploadRes.json();
        if (!uploadRes.ok || !uploadData.success) {
          throw new Error(uploadData.error || 'Image upload failed');
        }
        imageUrl = uploadData.url;
      }
      const res = await fetch(`/api/admin/items/${encodeURIComponent(itemID)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, itemImage: imageUrl }),
      });
      const data = await res.json();
      if (data.success) {
        router.push('/admin/marketplace');
      } else {
        setError(data.error || 'Failed to save');
      }
    } catch (e) {
      setError('Error saving');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="container mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold mb-4">Edit Item: {itemID}</h1>
      {loading ? (
        <div>Loading…</div>
      ) : (
        <form onSubmit={handleSave} className="space-y-4 max-w-2xl">
          {error && <div className="text-red-600">{error}</div>}
          {inventory && (
            <div className="p-3 border rounded bg-gray-50 text-sm">
              <div className="font-medium mb-1">Inventory</div>
              <div className="flex items-center gap-4">
                <div>Available: {inventory.available}/{inventory.total}</div>
                <div>Assigned: {inventory.assigned}</div>
                <div>Redeemed: {inventory.redeemed}</div>
                <a href={`/admin/marketplace/${encodeURIComponent(itemID)}/inventory`} className="text-indigo-600 underline">Manage inventory</a>
              </div>
            </div>
          )}
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
            {form.itemImage && !preview && (
              <img src={form.itemImage} alt="Current" className="mt-1 w-24 h-24 object-cover rounded border" />
            )}
            {preview && (
              <img src={preview} alt="Preview" className="mt-1 w-24 h-24 object-cover rounded border" />
            )}
            <input
              type="file"
              accept="image/*"
              className="mt-2"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  setFile(f);
                  const reader = new FileReader();
                  reader.onload = () => setPreview(reader.result);
                  reader.readAsDataURL(f);
                } else {
                  setFile(null);
                  setPreview(null);
                }
              }}
            />
          </div>
          <div className="pt-2">
            <button
              type="submit"
              disabled={saving}
              className={`px-4 py-2 rounded text-white ${saving ? 'bg-gray-400' : 'bg-blue-600 hover:bg-blue-700'}`}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              onClick={() => router.push('/admin/marketplace')}
              className="ml-3 px-4 py-2 rounded border"
            >
              Cancel
            </button>
          </div>

          {/* Team Variations */}
          <div className="mt-8 p-3 border rounded bg-gray-50">
            <div className="font-medium mb-2">Team Variations</div>
            {varsError ? (<div className="text-sm text-red-600 mb-2">{varsError}</div>) : null}
            {varsLoading ? (
              <div className="text-sm">Loading…</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left border-b">
                      <th className="py-2 pr-4">League</th>
                      <th className="py-2 pr-4">Team</th>
                      <th className="py-2 pr-4">Image</th>
                      <th className="py-2 pr-4">Priority</th>
                      <th className="py-2 pr-4">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {variations.length === 0 ? (
                      <tr><td colSpan={5} className="py-2 pr-4 text-gray-500">No team variations yet.</td></tr>
                    ) : variations.map(v => (
                      <tr key={v.id} className="border-b">
                        <td className="py-2 pr-4 uppercase text-gray-600">{v.teamLeague || ''}</td>
                        <td className="py-2 pr-4">{v.teamName || v.teamSlug || v.teamAbv}</td>
                        <td className="py-2 pr-4">
                          {v.imageUrl ? (<img src={v.imageUrl} alt="img" className="h-10 w-10 object-cover rounded" />) : '-'}
                        </td>
                        <td className="py-2 pr-4">{v.priority}</td>
                        <td className="py-2 pr-4">
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                const del = await fetch(`/api/admin/items/${encodeURIComponent(itemID)}/team-images`, {
                                  method: 'DELETE',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ teamId: v.teamId }),
                                });
                                const j = await del.json();
                                if (del.ok && j?.success) {
                                  setVariations(prev => prev.filter(x => x.id !== v.id));
                                }
                              } catch {}
                            }}
                            className="px-2 py-1 bg-red-200 rounded hover:bg-red-300"
                          >Delete</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Add variation */}
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-5 gap-3">
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
              <button
                type="button"
                className="px-3 py-2 bg-green-600 text-white rounded hover:bg-green-700"
                onClick={async () => {
                  if (!varTeamSlug) return;
                  let imageUrl = varImageUrl || '';
                  try {
                    if (varFile && varPreview) {
                      const toBase64 = (f) => new Promise((resolve, reject) => {
                        const reader = new FileReader();
                        reader.readAsDataURL(f);
                        reader.onload = () => resolve(reader.result.split(',')[1]);
                        reader.onerror = (err) => reject(err);
                      });
                      const base64Data = await toBase64(varFile);
                      const uploadRes = await fetch('/api/admin/uploadItemImage', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ filename: varFile.name, fileData: base64Data }),
                      });
                      const uploadData = await uploadRes.json();
                      if (!uploadRes.ok || !uploadData.success) throw new Error(uploadData.error || 'Upload failed');
                      imageUrl = uploadData.url;
                    }
                    const res = await fetch(`/api/admin/items/${encodeURIComponent(itemID)}/team-images`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ teamSlug: varTeamSlug, imageUrl, priority: varPriority }),
                    });
                    const data = await res.json();
                    if (res.ok && data?.success) {
                      // reload list
                      const list = await fetch(`/api/admin/items/${encodeURIComponent(itemID)}/team-images`);
                      const listJson = await list.json();
                      if (list.ok && listJson?.success) setVariations(Array.isArray(listJson.variations) ? listJson.variations : []);
                      setVarTeamLeague(''); setVarTeamSlug(''); setVarPriority(0); setVarFile(null); setVarPreview(null); setVarImageUrl('');
                    }
                  } catch (e) {}
                }}
              >Add Team Variation</button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}


