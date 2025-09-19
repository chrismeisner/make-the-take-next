import { useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';
import Link from 'next/link';

export default function AdminMarketplacePage() {
  const { data: session, status } = useSession();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sort, setSort] = useState({ field: 'title', order: 'asc' });
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [deleting, setDeleting] = useState(null); // itemID while confirming/deleting
  const [toast, setToast] = useState({ type: '', message: '' });

  useEffect(() => {
    if (status !== 'authenticated') return;
    (async () => {
      try {
        const res = await fetch('/api/admin/items');
        const data = await res.json();
        if (data.success) {
          setItems(Array.isArray(data.items) ? data.items : []);
        } else {
          setError(data.error || 'Failed to load items');
        }
      } catch (e) {
        setError('Error loading items');
      } finally {
        setLoading(false);
      }
    })();
  }, [status]);

  if (status === 'loading') {
    return <div className="container mx-auto px-4 py-6">Loading...</div>;
  }
  if (!session) {
    return <div className="container mx-auto px-4 py-6">Not authorized</div>;
  }

  const normalizedQuery = search.trim().toLowerCase();
  const searched = normalizedQuery
    ? items.filter((it) => {
        const title = String(it.itemName || '').toLowerCase();
        const brand = String(it.itemBrand || '').toLowerCase();
        const id = String(it.itemID || '').toLowerCase();
        return title.includes(normalizedQuery) || brand.includes(normalizedQuery) || id.includes(normalizedQuery);
      })
    : items;

  const byStatus = statusFilter === 'all' ? searched : searched.filter((it) => String(it.itemStatus || '').toLowerCase() === String(statusFilter).toLowerCase());

  const sorted = [...byStatus].sort((a, b) => {
    const { field, order } = sort;
    const dir = order === 'asc' ? 1 : -1;
    const av = field === 'tokens' ? Number(a.itemTokens) || 0 : String(a[field] || a.itemName || '').toLowerCase();
    const bv = field === 'tokens' ? Number(b.itemTokens) || 0 : String(b[field] || b.itemName || '').toLowerCase();
    if (av < bv) return -1 * dir;
    if (av > bv) return 1 * dir;
    return 0;
  });

  const toggleSort = (field) => {
    setSort((prev) => {
      if (prev.field === field) {
        return { field, order: prev.order === 'asc' ? 'desc' : 'asc' };
      }
      return { field, order: 'asc' };
    });
  };

  const statusOptions = Array.from(new Set(items.map((i) => i.itemStatus || 'Hidden').filter(Boolean))).sort();
  const filterOptions = ['all', ...statusOptions];

  async function handleDeleteItem(itemID) {
    if (!itemID) return;
    setDeleting(itemID);
    try {
      const res = await fetch(`/api/admin/items/${encodeURIComponent(itemID)}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setItems((prev) => prev.filter((i) => i.itemID !== itemID));
        setToast({ type: 'success', message: 'Item deleted.' });
      } else {
        setToast({ type: 'error', message: data.error || 'Failed to delete item' });
      }
    } catch (e) {
      setToast({ type: 'error', message: 'Error deleting item' });
    } finally {
      setDeleting(null);
      setTimeout(() => setToast({ type: '', message: '' }), 3000);
    }
  }

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Marketplace Items</h1>
        <div className="flex items-center gap-3">
          <Link href="/admin/marketplace/new" className="px-3 py-2 bg-green-600 text-white rounded hover:bg-green-700">New Item</Link>
          <Link href="/redeem" className="text-blue-600 underline">View Redeem Page</Link>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-4 mb-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">Search</label>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title, brand, or ID"
            className="mt-1 block w-80 rounded border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Filter by Status</label>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="mt-1 px-2 py-2 border rounded">
            {filterOptions.map((opt) => (
              <option key={opt} value={opt}>{opt === 'all' ? 'All' : opt}</option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div>Loading items…</div>
      ) : error ? (
        <div className="text-red-600">{error}</div>
      ) : (
        <>
        <div className="overflow-x-auto">
          <table className="min-w-full bg-white">
            <thead>
              <tr>
                <th className="px-4 py-2 border cursor-pointer select-none" onClick={() => toggleSort('itemName')}>
                  Title {sort.field === 'itemName' ? (sort.order === 'asc' ? '▲' : '▼') : ''}
                </th>
                <th className="px-4 py-2 border">Image</th>
                <th className="px-4 py-2 border">Brand</th>
                <th className="px-4 py-2 border">Status</th>
                <th className="px-4 py-2 border cursor-pointer select-none" onClick={() => toggleSort('tokens')}>
                  Tokens {sort.field === 'tokens' ? (sort.order === 'asc' ? '▲' : '▼') : ''}
                </th>
                <th className="px-4 py-2 border">Featured</th>
                <th className="px-4 py-2 border">Item ID</th>
                <th className="px-4 py-2 border">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((it) => (
                <tr key={it.itemID}>
                  <td className="px-4 py-2 border align-top">
                    <div className="font-medium">{it.itemName}</div>
                    <div className="text-sm text-gray-600 line-clamp-2 max-w-xl">{it.itemDescription}</div>
                  </td>
                  <td className="px-4 py-2 border align-top">
                    {it.itemImage ? (
                      <img src={it.itemImage} alt={it.itemName || 'Item'} className="w-16 h-16 object-cover rounded border" />
                    ) : (
                      <span className="text-gray-500">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2 border align-top">{it.itemBrand || '—'}</td>
                  <td className="px-4 py-2 border align-top">{it.itemStatus || '—'}</td>
                  <td className="px-4 py-2 border align-top">{Number(it.itemTokens) || 0}</td>
                  <td className="px-4 py-2 border align-top">{it.featured ? 'Yes' : 'No'}</td>
                  <td className="px-4 py-2 border align-top font-mono text-xs">{it.itemID}</td>
                  <td className="px-4 py-2 border align-top">
                    <div className="flex items-center gap-3">
                      <Link href={`/admin/marketplace/${encodeURIComponent(it.itemID)}`} className="text-blue-600 hover:underline">Edit</Link>
                      <button
                        className="text-red-600 hover:underline disabled:opacity-50"
                        disabled={deleting === it.itemID}
                        onClick={() => {
                          if (window.confirm(`Delete item ${it.itemName || it.itemID}? This cannot be undone.`)) {
                            handleDeleteItem(it.itemID);
                          }
                        }}
                      >
                        {deleting === it.itemID ? 'Deleting…' : 'Delete'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {toast.message && (
          <div className={`mt-4 text-sm ${toast.type === 'success' ? 'text-green-700' : 'text-red-700'}`}>{toast.message}</div>
        )}
        </>
      )}
    </div>
  );
}


