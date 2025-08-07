import { useSession } from 'next-auth/react';
import { useState, useEffect } from 'react';
import Link from 'next/link';

export default function AdminPacksPage() {
  const { data: session, status } = useSession();
  const [packs, setPacks] = useState([]);
  const [sortOrder, setSortOrder] = useState('desc');
  const [statusFilter, setStatusFilter] = useState('active');

  useEffect(() => {
    if (status !== 'authenticated') return;
    const fetchPacks = async () => {
      try {
        const res = await fetch('/api/packs');
        const data = await res.json();
        if (data.success) setPacks(data.packs);
        else console.error(data.error);
      } catch (err) {
        console.error('Error fetching packs:', err);
      }
    };
    fetchPacks();
  }, [status]);

  if (status === 'loading') {
    return <div className="container mx-auto px-4 py-6">Loading...</div>;
  }

  if (!session) {
    return <div className="container mx-auto px-4 py-6">Not authorized</div>;
  }
  // Build status filter options from fetched packs
  const statusOptions = Array.from(new Set(packs.map(p => p.packStatus))).sort();
  // Filter out packs by selected status
  const filteredPacks = packs.filter(p => p.packStatus === statusFilter);
  // Sort filtered packs by createdAt
  const sortedPacks = [...filteredPacks].sort((a, b) => {
    const dateA = new Date(a.createdAt);
    const dateB = new Date(b.createdAt);
    return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
  });

  return (
    <div className="container mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold mb-4">Packs Management</h1>
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700">Filter by Status</label>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
        >
          {statusOptions.map(status => (
            <option key={status} value={status}>{status.charAt(0).toUpperCase() + status.slice(1)}</option>
          ))}
        </select>
      </div>
      <div className="mb-4">
        <Link href="/admin/packs/new">
          <button className="px-3 py-2 bg-green-600 text-white rounded hover:bg-green-700">
            Create New Pack
          </button>
        </Link>
      </div>
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700">Sort by Created</label>
        <select
          value={sortOrder}
          onChange={e => setSortOrder(e.target.value)}
        >
          <option value="desc">Newest First</option>
          <option value="asc">Oldest First</option>
        </select>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full bg-white">
          <thead>
            <tr>
              <th className="px-4 py-2 border">Title</th>
              <th className="px-4 py-2 border">URL</th>
              <th className="px-4 py-2 border">Event</th>
              <th className="px-4 py-2 border">Status</th>
              <th className="px-4 py-2 border"># Props</th>
              <th className="px-4 py-2 border">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedPacks.map((pack) => (
              <tr key={pack.airtableId}>
                <td className="px-4 py-2 border">{pack.packTitle}</td>
                <td className="px-4 py-2 border">{pack.packURL}</td>
                <td className="px-4 py-2 border">{pack.eventTitle || '-'}</td>
                <td className="px-4 py-2 border">{pack.packStatus}</td>
                <td className="px-4 py-2 border">{pack.propsCount}</td>
                <td className="px-4 py-2 border">
                  <Link href={`/admin/packs/${pack.airtableId}`}>
                    <button className="px-2 py-1 text-blue-600 hover:underline">Details</button>
                  </Link>
                  <Link href={`/admin/grade/${pack.packURL}`}>
                    <button className="ml-2 px-2 py-1 text-purple-600 hover:underline">Grade</button>
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}