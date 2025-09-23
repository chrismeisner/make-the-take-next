import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';
import Link from 'next/link';

export default function ItemInventoryPage() {
  const router = useRouter();
  const { itemID } = router.query;
  const { data: session, status } = useSession();
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const [codes, setCodes] = useState([]);
  const [bulkText, setBulkText] = useState('');
  const [filter, setFilter] = useState('');

  useEffect(() => {
    if (status !== 'authenticated') return;
    if (!itemID) return;
    loadCodes();
  }, [status, itemID, filter]);

  async function loadCodes() {
    setLoading(true);
    setError('');
    try {
      const url = filter
        ? `/api/admin/items/${encodeURIComponent(itemID)}/codes?status=${encodeURIComponent(filter)}`
        : `/api/admin/items/${encodeURIComponent(itemID)}/codes`;
      const res = await fetch(url);
      const data = await res.json();
      if (res.ok && data.success) {
        setCodes(data.codes || []);
      } else {
        setError(data.error || 'Failed to load codes');
      }
    } catch (e) {
      setError('Error loading codes');
    } finally {
      setLoading(false);
    }
  }

  async function handleBulkAdd(e) {
    e.preventDefault();
    if (!bulkText.trim()) return;
    setAdding(true);
    setError('');
    try {
      const lines = bulkText
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean);
      const res = await fetch(`/api/admin/items/${encodeURIComponent(itemID)}/codes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codes: lines }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to add codes');
      }
      setBulkText('');
      await loadCodes();
    } catch (e) {
      setError(e.message || 'Error adding codes');
    } finally {
      setAdding(false);
    }
  }

  if (status === 'loading') return <div className="container mx-auto px-4 py-6">Loading…</div>;
  if (!session) return <div className="container mx-auto px-4 py-6">Not authorized</div>;

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Inventory for {itemID}</h1>
        <Link href={`/admin/marketplace/${encodeURIComponent(itemID)}`} className="text-blue-600 underline">Back to Item</Link>
      </div>

      {error && <div className="text-red-600 mb-3">{error}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <div className="flex items-end gap-3 mb-3">
            <div>
              <label className="block text-sm font-medium text-gray-700">Filter status</label>
              <select value={filter} onChange={(e) => setFilter(e.target.value)} className="mt-1 px-2 py-2 border rounded">
                <option value="">All</option>
                <option value="available">Available</option>
                <option value="assigned">Assigned</option>
                <option value="redeemed">Redeemed</option>
                <option value="disabled">Disabled</option>
              </select>
            </div>
          </div>
          {loading ? (
            <div>Loading codes…</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full bg-white">
                <thead>
                  <tr>
                    <th className="px-4 py-2 border">Code</th>
                    <th className="px-4 py-2 border">Status</th>
                    <th className="px-4 py-2 border">User</th>
                    <th className="px-4 py-2 border">Email</th>
                    <th className="px-4 py-2 border">Assigned</th>
                    <th className="px-4 py-2 border">Redeemed</th>
                  </tr>
                </thead>
                <tbody>
                  {codes.map((c) => (
                    <tr key={c.id}>
                      <td className="px-4 py-2 border font-mono text-xs">{c.code}</td>
                      <td className="px-4 py-2 border">{c.status}</td>
                      <td className="px-4 py-2 border text-xs">
                        {c.assignedProfileID ? (
                          <Link className="text-blue-600 underline" href={`/profile/${encodeURIComponent(c.assignedProfileID)}`}>
                            {c.assignedProfileID}
                          </Link>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-2 border text-xs">
                        {c.redemptionEmail ? (
                          <a className="text-blue-600 underline" href={`mailto:${c.redemptionEmail}`}>{c.redemptionEmail}</a>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-2 border text-xs">{c.assignedAt ? new Date(c.assignedAt).toLocaleString() : '—'}</td>
                      <td className="px-4 py-2 border text-xs">{c.redeemedAt ? new Date(c.redeemedAt).toLocaleString() : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div>
          <form onSubmit={handleBulkAdd} className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">Bulk add codes (one per line)</label>
            <textarea
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              rows={12}
              className="mt-1 block w-full rounded border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              placeholder={`ABC-123\nDEF-456\n...`}
            />
            <div>
              <button
                type="submit"
                disabled={adding}
                className={`px-4 py-2 rounded text-white ${adding ? 'bg-gray-400' : 'bg-green-600 hover:bg-green-700'}`}
              >
                {adding ? 'Adding…' : 'Add Codes'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}


