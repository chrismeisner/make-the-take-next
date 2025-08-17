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
  const [sortOrder, setSortOrder] = useState('asc');
  const [fromDateTime, setFromDateTime] = useState('');
  const [toDateTime, setToDateTime] = useState('');

  const [savingRow, setSavingRow] = useState(null);

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

  // Default date range to today on first load
  useEffect(() => {
    if (!fromDateTime && !toDateTime) {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date();
      end.setHours(23, 59, 0, 0);
      setFromDateTime(formatDateTimeLocal(start));
      setToDateTime(formatDateTimeLocal(end));
    }
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

  if (status === 'loading') {
    return <div className="container mx-auto px-4 py-6">Loading...</div>;
  }
  if (!session) {
    return <div className="container mx-auto px-4 py-6">Not authorized</div>;
  }

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
      .filter((p) => !statusFilter || String(p.propStatus).toLowerCase() === statusFilter)
      .filter((p) => !leagueFilter || p.eventLeague === leagueFilter)
      .filter((p) => {
        if (!t) return true;
        const hay = [p.propShort, p.propSummary, p.eventTitle].filter(Boolean).join(' ').toLowerCase();
        return hay.includes(t);
      })
      .filter((p) => {
        const ms = p.eventTime ? new Date(p.eventTime).getTime() : null;
        if (ms == null) return false;
        if (fromMs != null && ms < fromMs) return false;
        if (toMs != null && ms > toMs) return false;
        return true;
      })
      .sort((a, b) => {
        const ta = a.eventTime ? new Date(a.eventTime).getTime() : 0;
        const tb = b.eventTime ? new Date(b.eventTime).getTime() : 0;
        return sortOrder === 'asc' ? ta - tb : tb - ta;
      });
  }, [items, searchText, statusFilter, leagueFilter, sortOrder]);

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
      <h1 className="text-2xl font-bold mb-4">Props Management</h1>

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
          <label className="block text-sm font-medium text-gray-700">Sort by Time</label>
          <select
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
            className="mt-1 px-3 py-2 border rounded w-full"
          >
            <option value="asc">Soonest</option>
            <option value="desc">Latest</option>
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
              <th className="px-4 py-2 border">Time</th>
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
                <td className="px-4 py-2 border align-top text-sm">{renderEventTime(p.eventTime)}</td>
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
                  <div className="flex flex-wrap gap-2">
                    <Link href={`/admin/props/${p.airtableId}`}>
                      <button className="px-2 py-1 text-gray-700 hover:underline">Edit</button>
                    </Link>
                    {p.propID && (
                      <Link href={`/props/${p.propID}`}>
                        <button className="px-2 py-1 text-blue-600 hover:underline">Public</button>
                      </Link>
                    )}
                    {p.propID && (
                      <Link href={`/admin/gradeProps?ids=${encodeURIComponent(p.propID)}`}>
                        <button className="px-2 py-1 text-purple-600 hover:underline">Grade</button>
                      </Link>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}


