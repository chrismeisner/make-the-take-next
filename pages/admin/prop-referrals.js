import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

export default function PropReferralsAdminPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [limit, setLimit] = useState(200);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = String(query || '').toLowerCase().trim();
    if (!q) return rows;
    return rows.filter((r) =>
      String(r.code || '').toLowerCase().includes(q) ||
      String(r.name || '').toLowerCase().includes(q)
    );
  }, [rows, query]);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/admin/referrals/list?limit=${encodeURIComponent(limit)}`);
      const data = await res.json();
      if (res.ok && data.success) {
        setRows(data.referrals || []);
      } else {
        setError(data.error || 'Failed to load');
      }
    } catch (e) {
      setError(e.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Prop Referrals</h1>
        <Link href="/admin" className="text-blue-600 hover:underline">Back to Admin</Link>
      </div>

      <section className="border rounded-lg p-4 mb-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-sm text-gray-700">Search</label>
            <input value={query} onChange={(e) => setQuery(e.target.value)} className="mt-1 px-3 py-2 border rounded min-w-[16rem]" placeholder="Filter by code or name" />
          </div>
          <div>
            <label className="block text-sm text-gray-700">Limit</label>
            <input type="number" min={1} value={limit} onChange={(e) => setLimit(Number(e.target.value) || 200)} className="mt-1 px-3 py-2 border rounded w-28" />
          </div>
          <button onClick={load} className="px-3 py-2 bg-gray-100 rounded hover:bg-gray-200">Refresh</button>
        </div>
      </section>

      <section className="border rounded-lg p-4">
        <h2 className="text-lg font-semibold mb-3">Referral Award Codes (ref5:…)</h2>
        {loading ? (
          <p>Loading…</p>
        ) : error ? (
          <p className="text-red-600">{error}</p>
        ) : filtered.length === 0 ? (
          <p>No referral awards found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left border-b">
                  <th className="py-2 pr-4">Code</th>
                  <th className="py-2 pr-4">Name</th>
                  <th className="py-2 pr-4">Tokens</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Redemptions</th>
                  <th className="py-2 pr-4">Created</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.code} className="border-b last:border-b-0">
                    <td className="py-2 pr-4 font-mono">{r.code}</td>
                    <td className="py-2 pr-4">{r.name}</td>
                    <td className="py-2 pr-4">{r.tokens}</td>
                    <td className="py-2 pr-4">{r.status}</td>
                    <td className="py-2 pr-4">{r.redemption_count}</td>
                    <td className="py-2 pr-4">{r.created_at ? new Date(r.created_at).toLocaleString() : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}


