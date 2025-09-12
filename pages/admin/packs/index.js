import { useSession } from 'next-auth/react';
import { useState, useEffect } from 'react';
import Link from 'next/link';

export default function AdminPacksPage() {
  const { data: session, status } = useSession();
  const [packs, setPacks] = useState([]);
  const [sortOrder, setSortOrder] = useState('desc');
  const [headerSort, setHeaderSort] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [hideGraded, setHideGraded] = useState(false);
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState(null);

  useEffect(() => {
    if (status !== 'authenticated') return;
    const fetchPacks = async () => {
      try {
        const res = await fetch('/api/packs?includeAll=1');
        const data = await res.json();
        if (data.success) setPacks(data.packs);
        else console.error(data.error);
      } catch (err) {
        console.error('Error fetching packs:', err);
      }
    };
    fetchPacks();
  }, [status]);

  const refetchPacks = async () => {
    try {
      const res = await fetch('/api/packs?includeAll=1');
      const data = await res.json();
      if (data.success) setPacks(data.packs);
    } catch (e) {}
  };

  const handleRunPackStatus = async () => {
    setRunning(true);
    setRunResult(null);
    try {
      const res = await fetch('/api/admin/runPackStatus', { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setRunResult({ ok: false, message: data.error || 'Failed to run' });
      } else {
        setRunResult({ ok: true, message: `Opened ${data.openedCount}, closed ${data.closedCount}` });
        await refetchPacks();
      }
    } catch (e) {
      setRunResult({ ok: false, message: e?.message || 'Error' });
    } finally {
      setRunning(false);
    }
  };

  if (status === 'loading') {
    return <div className="container mx-auto px-4 py-6">Loading...</div>;
  }

  if (!session) {
    return <div className="container mx-auto px-4 py-6">Not authorized</div>;
  }
  // Build status filter options from fetched packs
  const statusOptions = Array.from(new Set(packs.map(p => p.packStatus))).sort();
  const selectOptions = ['all', ...statusOptions];
  // Filter out packs by selected status (or show all)
  const filteredPacks = statusFilter === 'all' ? packs : packs.filter(p => p.packStatus === statusFilter);
  // Optionally hide graded packs
  const visibilityFilteredPacks = hideGraded
    ? filteredPacks.filter(p => String(p.packStatus || '').toLowerCase() !== 'graded')
    : filteredPacks;
  // Apply search filtering (title, url, or event title)
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const searchedPacks = normalizedQuery
    ? filteredPacks.filter(p => {
        const title = String(p.packTitle || '').toLowerCase();
        const url = String(p.packURL || '').toLowerCase();
        const eventTitle = String(p.eventTitle || '').toLowerCase();
        return (
          title.includes(normalizedQuery) ||
          url.includes(normalizedQuery) ||
          eventTitle.includes(normalizedQuery)
        );
      })
    : visibilityFilteredPacks;
  // Determine active sort from header (if any) or fallback to createdAt
  const activeSortField = headerSort?.field || 'createdAt';
  const activeSortOrder = headerSort?.order || sortOrder;

  const sortedPacks = [...searchedPacks].sort((a, b) => {
    const aRaw = a?.[activeSortField];
    const bRaw = b?.[activeSortField];
    const aTime = aRaw ? new Date(aRaw).getTime() : NaN;
    const bTime = bRaw ? new Date(bRaw).getTime() : NaN;

    const norm = (t) => (Number.isFinite(t) ? t : (activeSortOrder === 'asc' ? Infinity : -Infinity));
    const aVal = norm(aTime);
    const bVal = norm(bTime);

    if (aVal === bVal) return 0;
    return activeSortOrder === 'asc' ? aVal - bVal : bVal - aVal;
  });

  const toggleHeaderSort = (field) => {
    setHeaderSort((prev) => {
      if (prev && prev.field === field) {
        return { field, order: prev.order === 'asc' ? 'desc' : 'asc' };
      }
      return { field, order: 'desc' };
    });
  };

  const renderSortIndicator = (field) => {
    if (!headerSort || headerSort.field !== field) return null;
    return <span className="ml-1">{headerSort.order === 'asc' ? '▲' : '▼'}</span>;
  };

  return (
    <div className="container mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold mb-4">Packs Management</h1>
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700">Filter by Status</label>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
        >
          {selectOptions.map(status => (
            <option key={status} value={status}>
              {status === 'all' ? 'All Packs' : (status.charAt(0).toUpperCase() + status.slice(1))}
            </option>
          ))}
        </select>
      </div>
      <div className="mb-4 flex items-center gap-3">
        <Link href="/admin/packs/new">
          <button className="px-3 py-2 bg-green-600 text-white rounded hover:bg-green-700">
            Create New Pack
          </button>
        </Link>
        <button
          type="button"
          onClick={handleRunPackStatus}
          disabled={running}
          className={`px-3 py-2 rounded text-white ${running ? 'bg-gray-400' : 'bg-blue-600 hover:bg-blue-700'}`}
          title="Run auto open/close status now"
        >
          {running ? 'Running…' : 'Run pack status'}
        </button>
        {runResult && (
          <span className={`${runResult.ok ? 'text-green-700' : 'text-red-700'}`}>
            {runResult.message}
          </span>
        )}
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
      <div className="mb-4 flex items-center gap-4">
        <label className="block text-sm font-medium text-gray-700">Search Packs</label>
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search by title, URL, or event"
          className="mt-1 block w-80 rounded border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
        />
        <label className="inline-flex items-center gap-2 text-sm text-gray-700 ml-4">
          <input
            type="checkbox"
            checked={hideGraded}
            onChange={e => setHideGraded(e.target.checked)}
            className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
          />
          Hide graded
        </label>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full bg-white">
          <thead>
            <tr>
              <th className="px-4 py-2 border">Title</th>
              <th className="px-4 py-2 border">URL</th>
              <th className="px-4 py-2 border">Event</th>
              <th
                className="px-4 py-2 border cursor-pointer select-none"
                onClick={() => toggleHeaderSort('packOpenTime')}
                aria-sort={headerSort?.field === 'packOpenTime' ? (headerSort.order === 'asc' ? 'ascending' : 'descending') : 'none'}
                title="Sort by Open Time"
              >
                Open Time {renderSortIndicator('packOpenTime')}
              </th>
              <th
                className="px-4 py-2 border cursor-pointer select-none"
                onClick={() => toggleHeaderSort('packCloseTime')}
                aria-sort={headerSort?.field === 'packCloseTime' ? (headerSort.order === 'asc' ? 'ascending' : 'descending') : 'none'}
                title="Sort by Close Time"
              >
                Close Time {renderSortIndicator('packCloseTime')}
              </th>
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
                <td className="px-4 py-2 border">{pack.packOpenTime ? new Date(pack.packOpenTime).toLocaleString() : '-'}</td>
                <td className="px-4 py-2 border">{pack.packCloseTime ? new Date(pack.packCloseTime).toLocaleString() : '-'}</td>
                <td className="px-4 py-2 border">{pack.packStatus}</td>
                <td className="px-4 py-2 border">{pack.propsCount}</td>
                <td className="px-4 py-2 border">
                  <Link href={`/admin/packs/${pack.airtableId}`}>
                    <button className="px-2 py-1 text-blue-600 hover:underline">Details</button>
                  </Link>
                  <Link href={`/admin/packs/${pack.airtableId}/edit`}>
                    <button className="ml-2 px-2 py-1 text-green-600 hover:underline">Edit</button>
                  </Link>
                  <Link href={`/admin/grade/${pack.packURL}`}>
                    <button className="ml-2 px-2 py-1 text-purple-600 hover:underline">Grade</button>
                  </Link>
                  <Link href={`/admin/packs/${encodeURIComponent(pack.airtableId)}/create-prop`}>
                    <button className="ml-2 px-2 py-1 text-indigo-600 hover:underline">Add prop</button>
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