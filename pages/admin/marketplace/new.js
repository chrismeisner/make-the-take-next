import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import { useState } from 'react';

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


