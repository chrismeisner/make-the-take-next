import { useSession } from 'next-auth/react';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

// Stable v1 Props table for Admin:
// - Uses existing GET /api/props with server-side pagination (limit + offset)
// - Client-side filters: status, league, search; sort by event time
// - Inline status update via PATCH /api/props per row
// - Actions: open public prop page (if propID), quick Grade (if propID)

export default function AdminPropsPage() {
  const { data: session, status } = useSession();

  const [items, setItems] = useState([]);
  const [nextOffset, setNextOffset] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [leagueFilter, setLeagueFilter] = useState('');
  const [sortOrder, setSortOrder] = useState('desc');
  const [fromDateTime, setFromDateTime] = useState('');
  const [toDateTime, setToDateTime] = useState('');
  const [selectedStatuses, setSelectedStatuses] = useState([]);

  const [savingRow, setSavingRow] = useState(null);
  const [deletingRow, setDeletingRow] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState({ open: false, id: null, title: '' });

  const allowedStatuses = ['open', 'closed', 'gradeda', 'gradedb', 'push'];

  const formatDateTimeLocal = (date) => {
    const pad = (n) => String(n).padStart(2, '0');
    const y = date.getFullYear();
    const m = pad(date.getMonth() + 1);
    const d = pad(date.getDate());
    const hh = pad(date.getHours());
    const mm = pad(date.getMinutes());
    return `${y}-${m}-${d}T${hh}:${mm}`;
  };

  // Show all props by default; no initial date filtering
  useEffect(() => {
    // Intentionally left blank to avoid setting default date range
  }, []);

  const loadPage = async (offset = '') => {
    setLoading(true);
    setError(null);
    try {
      const url = new URL('/api/props', window.location.origin);
      url.searchParams.set('limit', '50');
      if (offset) url.searchParams.set('offset', offset);
      // Use default view; can pass a specific Airtable view via `view` query later if needed
      const res = await fetch(url.toString());
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to fetch props');
      setItems(prev => [...prev, ...(data.props || [])]);
      setNextOffset(data.nextOffset || null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (status !== 'authenticated') return;
    // First page
    setItems([]);
    setNextOffset(null);
    loadPage('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const isAuthLoading = status === 'loading';

  const statusOptions = useMemo(() => {
    const vals = new Set();
    items.forEach(p => { if (p.propStatus) vals.add(String(p.propStatus).toLowerCase()); });
    const arr = Array.from(vals);
    arr.sort();
    return arr;
  }, [items]);

  const leagueOptions = useMemo(() => {
    const vals = new Set();
    items.forEach(p => { if (p.eventLeague) vals.add(p.eventLeague); });
    const arr = Array.from(vals);
    arr.sort();
    return arr;
  }, [items]);

  const filtered = useMemo(() => {
    const t = searchText.trim().toLowerCase();
    const fromMs = fromDateTime ? new Date(fromDateTime).getTime() : null;
    const toMs = toDateTime ? new Date(toDateTime).getTime() : null;
    return items
      .filter((p) => {
        const s = String(p.propStatus).toLowerCase();
        if (selectedStatuses && selectedStatuses.length > 0) {
          return selectedStatuses.includes(s);
        }
        return !statusFilter || s === statusFilter;
      })
      .filter((p) => !leagueFilter || p.eventLeague === leagueFilter)
      .filter((p) => {
        if (!t) return true;
        const hay = [p.propShort, p.propSummary, p.eventTitle].filter(Boolean).join(' ').toLowerCase();
        return hay.includes(t);
      })
      .filter((p) => {
        const ms = p.eventTime ? new Date(p.eventTime).getTime() : null;
        // If no date filters are set, do not filter by time
        if (fromMs == null && toMs == null) return true;
        if (ms == null) return false;
        if (fromMs != null && ms < fromMs) return false;
        if (toMs != null && ms > toMs) return false;
        return true;
      })
      .sort((a, b) => {
        const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return sortOrder === 'asc' ? ta - tb : tb - ta;
      });
  }, [items, searchText, statusFilter, selectedStatuses, leagueFilter, sortOrder, fromDateTime, toDateTime]);

  const handleStatusChange = async (airtableId, newStatus) => {
    setSavingRow(airtableId);
    try {
      const res = await fetch('/api/props', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ propId: airtableId, propStatus: newStatus })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to save');
      setItems(prev => prev.map(p => p.airtableId === airtableId ? { ...p, propStatus: newStatus } : p));
    } catch (e) {
      alert(e.message);
    } finally {
      setSavingRow(null);
    }
  };

  const requestDelete = (id, title) => {
    setConfirmDelete({ open: true, id, title: title || 'this prop' });
  };

  const cancelDelete = () => setConfirmDelete({ open: false, id: null, title: '' });

  const confirmDeleteNow = async () => {
    if (!confirmDelete.id) return;
    const id = confirmDelete.id;
    setDeletingRow(id);
    try {
      const res = await fetch('/api/props', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ propId: id })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to delete');
      setItems(prev => prev.filter(p => p.airtableId !== id));
      cancelDelete();
    } catch (e) {
      alert(e.message);
    } finally {
      setDeletingRow(null);
    }
  };

  const renderEventTime = (t) => {
    if (!t) return '';
    try {
      const d = new Date(t);
      return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(d);
    } catch {
      return new Date(t).toLocaleString();
    }
  };

  return (
    <div className="container mx-auto px-4 py-6">
      {isAuthLoading && (
        <div>Loading...</div>
      )}
      {!isAuthLoading && !session && (
        <div>Not authorized</div>
      )}
      {!isAuthLoading && session && (
        <>
      <h1 className="text-2xl font-bold mb-4">Props Management</h1>

      <div className="mb-4">
        <div className="text-sm font-medium text-gray-700 mb-1">Statuses</div>
        <div className="flex flex-wrap items-center gap-3">
          {allowedStatuses.map((s) => (
            <label key={s} className="inline-flex items-center gap-1">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={selectedStatuses.includes(s)}
                onChange={() => {
                  setSelectedStatuses((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]);
                }}
              />
              <span className="text-sm capitalize">{s}</span>
            </label>
          ))}
          {selectedStatuses.length > 0 && (
            <button
              type="button"
              onClick={() => setSelectedStatuses([])}
              className="text-xs px-2 py-1 border rounded border-gray-300 text-gray-700 hover:bg-gray-50"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      <div className="mb-4 grid grid-cols-1 md:grid-cols-4 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700">Search</label>
          <input
            type="text"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Search question, summary, event title..."
            className="mt-1 px-3 py-2 border rounded w-full"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Status</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="mt-1 px-3 py-2 border rounded w-full"
          >
            <option value="">All</option>
            {statusOptions.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">League</label>
          <select
            value={leagueFilter}
            onChange={(e) => setLeagueFilter(e.target.value)}
            className="mt-1 px-3 py-2 border rounded w-full"
          >
            <option value="">All</option>
            {leagueOptions.map((lg) => (
              <option key={lg} value={lg}>{lg}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Sort by Created</label>
          <select
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
            className="mt-1 px-3 py-2 border rounded w-full"
          >
            <option value="asc">Oldest</option>
            <option value="desc">Newest</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">From</label>
          <input
            type="datetime-local"
            value={fromDateTime}
            onChange={(e) => setFromDateTime(e.target.value)}
            className="mt-1 px-3 py-2 border rounded w-full"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">To</label>
          <input
            type="datetime-local"
            value={toDateTime}
            onChange={(e) => setToDateTime(e.target.value)}
            className="mt-1 px-3 py-2 border rounded w-full"
          />
        </div>
      </div>

      <div className="mb-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => { setItems([]); setNextOffset(null); loadPage(''); }}
          disabled={loading}
          className={`px-3 py-2 rounded text-white ${loading ? 'bg-gray-400' : 'bg-blue-600 hover:bg-blue-700'}`}
        >
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
        {nextOffset && (
          <button
            type="button"
            onClick={() => loadPage(nextOffset)}
            disabled={loading}
            className={`px-3 py-2 rounded text-white ${loading ? 'bg-gray-400' : 'bg-indigo-600 hover:bg-indigo-700'}`}
          >
            {loading ? 'Loading…' : 'Load More'}
          </button>
        )}
        {error && <span className="text-red-700 text-sm">{error}</span>}
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full bg-white">
          <thead>
            <tr>
              <th className="px-4 py-2 border text-left">Question</th>
              <th className="px-4 py-2 border text-left">Event</th>
              <th className="px-4 py-2 border whitespace-nowrap w-40">Time</th>
              <th className="px-4 py-2 border whitespace-nowrap w-40">Created</th>
              <th className="px-4 py-2 border">League</th>
              <th className="px-4 py-2 border">Status</th>
              <th className="px-4 py-2 border">Packs</th>
              <th className="px-4 py-2 border">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr key={p.airtableId}>
                <td className="px-4 py-2 border align-top">
                  <div className="font-medium">{p.propShort || p.propTitle || 'Untitled'}</div>
                  {p.propSummary && (
                    <div className="text-xs text-gray-600 mt-1">{p.propSummary}</div>
                  )}
                </td>
                <td className="px-4 py-2 border align-top">
                  <div>{p.eventTitle || ''}</div>
                </td>
                <td className="px-4 py-2 border align-top text-sm whitespace-nowrap w-40">{renderEventTime(p.eventTime)}</td>
                <td className="px-4 py-2 border align-top text-sm whitespace-nowrap w-40">{renderEventTime(p.createdAt)}</td>
                <td className="px-4 py-2 border align-top text-sm">{p.eventLeague || ''}</td>
                <td className="px-4 py-2 border align-top">
                  <div className="flex items-center gap-2">
                    <select
                      value={String(p.propStatus || '').toLowerCase()}
                      onChange={(e) => handleStatusChange(p.airtableId, e.target.value)}
                      disabled={savingRow === p.airtableId}
                      className="px-2 py-1 border rounded"
                    >
                      {allowedStatuses.map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                    {savingRow === p.airtableId && <span className="text-xs text-gray-600">Saving…</span>}
                  </div>
                </td>
                <td className="px-4 py-2 border align-top text-center">{Array.isArray(p.linkedPacks) ? p.linkedPacks.length : 0}</td>
                <td className="px-4 py-2 border align-top">
                  <div className="flex flex-nowrap items-center gap-2 whitespace-nowrap">
                    <Link href={`/admin/props/${p.airtableId}`}>
                      <button className="px-2 py-1 text-gray-700 hover:underline">Edit</button>
                    </Link>
                    {p.propID && (
                      <Link href={`/props/${p.propID}`}>
                        <button className="px-2 py-1 text-blue-600 hover:underline">Public</button>
                      </Link>
                    )}
                    {(() => {
                      const idForGrade = p.propID || p.airtableId;
                      if (!idForGrade) return null;
                      return (
                      <Link href={`/admin/gradeProps?ids=${encodeURIComponent(idForGrade)}`}>
                        <button className="px-2 py-1 text-purple-600 hover:underline">Grade</button>
                      </Link>
                      );
                    })()}
                    <button
                      type="button"
                      onClick={() => requestDelete(p.airtableId, p.propShort || p.propTitle || 'Untitled')}
                      disabled={deletingRow === p.airtableId}
                      className={`px-2 py-1 ${deletingRow === p.airtableId ? 'text-gray-400' : 'text-red-600 hover:underline'}`}
                    >
                      {deletingRow === p.airtableId ? 'Deleting…' : 'Delete'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {confirmDelete.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded shadow-lg p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold mb-2">Delete prop?</h2>
            <p className="text-sm text-gray-700 mb-4">Are you sure you want to permanently delete “{confirmDelete.title}”? This action cannot be undone.</p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={cancelDelete}
                className="px-3 py-2 rounded border border-gray-300 text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeleteNow}
                className="px-3 py-2 rounded text-white bg-red-600 hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
}


