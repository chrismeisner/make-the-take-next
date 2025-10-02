import { useSession } from 'next-auth/react';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useModal } from '../../contexts/ModalContext';

const oddsmakerOptions = [
  { label: 'ESPN BET (58)', value: '58' },
  { label: 'Caesars (38)', value: '38' },
  { label: 'William Hill (31)', value: '31' },
  { label: 'SugarHouse (41)', value: '41' },
  { label: 'Unibet (36)', value: '36' },
  { label: 'Bet365 (2000)', value: '2000' },
  { label: 'Westgate (25)', value: '25' },
  { label: 'Accuscore (1001)', value: '1001' },
  { label: 'Consensus (1004)', value: '1004' },
  { label: 'Numberfire (1003)', value: '1003' },
  { label: 'TeamRankings (1002)', value: '1002' },
];

export default function AdminEventsPage() {
  const { data: session, status } = useSession();
  const { openModal, closeModal } = useModal();
  const [events, setEvents] = useState([]);
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedQuickRange, setSelectedQuickRange] = useState('today');
  const [filterText, setFilterText] = useState('');
  const [sortOrder, setSortOrder] = useState('asc');
  const [selectedLeague, setSelectedLeague] = useState('');
  const [jobRunningProps, setJobRunningProps] = useState(false);
  const [jobResultProps, setJobResultProps] = useState(null);
  const [jobRunningPack, setJobRunningPack] = useState(false);
  const [jobResultPack, setJobResultPack] = useState(null);
  const [dryRun, setDryRun] = useState(true);
  const [providerId, setProviderId] = useState('58');

  useEffect(() => {
    if (status !== 'authenticated') return;
    const fetchEvents = async () => {
      try {
        const res = await fetch('/api/admin/events');
        const data = await res.json();
        if (data.success) setEvents(data.events);
        else console.error(data.error);
      } catch (err) {
        console.error('Error fetching events:', err);
      }
    };
    fetchEvents();
  }, [status]);

  if (status === 'loading') {
    return <div className="container mx-auto px-4 py-6">Loading...</div>;
  }

  if (!session) {
    return <div className="container mx-auto px-4 py-6">Not authorized</div>;
  }

  const getQuickRangeBounds = (key) => {
    if (!key) return null;
    const now = new Date();
    const startOfDay = (d) => {
      const s = new Date(d);
      s.setHours(0, 0, 0, 0);
      return s;
    };
    const endOfDay = (d) => {
      const e = new Date(d);
      e.setHours(23, 59, 59, 999);
      return e;
    };
    if (key === 'today') {
      return { start: startOfDay(now), end: endOfDay(now) };
    }
    if (key === 'yesterday') {
      const y = new Date(now);
      y.setDate(now.getDate() - 1);
      return { start: startOfDay(y), end: endOfDay(y) };
    }
    if (key === 'tomorrow') {
      const t = new Date(now);
      t.setDate(now.getDate() + 1);
      return { start: startOfDay(t), end: endOfDay(t) };
    }
    if (key === 'thisWeek') {
      const d = new Date(now);
      const day = d.getDay();
      // Start Monday (1) through Sunday (0)
      const diffToMonday = (day === 0 ? -6 : 1) - day;
      const start = new Date(d);
      start.setDate(d.getDate() + diffToMonday);
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      return { start: startOfDay(start), end: endOfDay(end) };
    }
    return null;
  };

  const quickBounds = getQuickRangeBounds(selectedQuickRange);
  const filteredEvents = events.filter(ev => {
    const titleOk = ev.eventTitle.toLowerCase().includes(filterText.toLowerCase());
    const leagueOk = (selectedLeague === '' || ev.eventLeague === selectedLeague);
    const dateOk = (selectedDate === '' || new Date(ev.eventTime).toLocaleDateString('en-CA') === selectedDate);
    const rangeOk = !quickBounds || (new Date(ev.eventTime) >= quickBounds.start && new Date(ev.eventTime) <= quickBounds.end);
    return titleOk && leagueOk && dateOk && rangeOk;
  });
  const sortedEvents = [...filteredEvents].sort((a, b) => {
    const dateA = new Date(a.eventTime);
    const dateB = new Date(b.eventTime);
    return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
  });
  const leagueOptions = Array.from(new Set(events.map(ev => ev.eventLeague).filter(Boolean)));

  return (
    <div className="container mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold mb-4">Events Management</h1>
      <div className="mb-4 flex items-center gap-3">
        <button
          type="button"
          onClick={() => {
            openModal('fetchEvents', {
              onFetched: async () => {
                try {
                  const res = await fetch('/api/admin/events');
                  const data = await res.json();
                  if (data.success) setEvents(data.events);
                } catch {}
              },
            });
          }}
          className="px-3 py-2 rounded text-white bg-emerald-600 hover:bg-emerald-700"
        >
          Fetch Events
        </button>
        <button
          type="button"
          disabled={jobRunningProps}
          onClick={async () => {
            setJobRunningProps(true);
            setJobResultProps(null);
            try {
              const params = new URLSearchParams();
              if (selectedLeague) params.set('league', selectedLeague.toLowerCase());
              else params.set('league', 'mlb');
              params.set('date', selectedDate || new Date().toLocaleDateString('en-CA'));
              params.set('tz', 'America/New_York');
              params.set('providerId', providerId || '58');
              params.set('dryRun', dryRun ? 'true' : 'false');
              params.set('mode', 'props');
              const res = await fetch(`/api/admin/jobs/createMoneylinePack?${params.toString()}`, { method: 'POST' });
              const data = await res.json();
              setJobResultProps(data);
            } catch (e) {
              setJobResultProps({ success: false, error: e.message });
            } finally {
              setJobRunningProps(false);
            }
          }}
          className={`px-3 py-2 rounded text-white ${jobRunningProps ? 'bg-gray-400' : 'bg-indigo-600 hover:bg-indigo-700'}`}
        >
          {jobRunningProps ? 'Running…' : 'Make Moneyline Props'}
        </button>
        <button
          type="button"
          disabled={jobRunningPack}
          onClick={async () => {
            setJobRunningPack(true);
            setJobResultPack(null);
            try {
              const params = new URLSearchParams();
              if (selectedLeague) params.set('league', selectedLeague.toLowerCase());
              else params.set('league', 'mlb');
              params.set('date', selectedDate || new Date().toLocaleDateString('en-CA'));
              params.set('tz', 'America/New_York');
              params.set('providerId', providerId || '58');
              params.set('dryRun', dryRun ? 'true' : 'false');
              params.set('mode', 'pack');
              const res = await fetch(`/api/admin/jobs/createMoneylinePack?${params.toString()}`, { method: 'POST' });
              const data = await res.json();
              setJobResultPack(data);
            } catch (e) {
              setJobResultPack({ success: false, error: e.message });
            } finally {
              setJobRunningPack(false);
            }
          }}
          className={`px-3 py-2 rounded text-white ${jobRunningPack ? 'bg-gray-400' : 'bg-indigo-600 hover:bg-indigo-700'}`}
        >
          {jobRunningPack ? 'Running…' : 'Make Moneyline Pack'}
        </button>
        <label className="inline-flex items-center text-sm text-gray-700">
          <input
            type="checkbox"
            className="mr-2"
            checked={dryRun}
            onChange={(e) => setDryRun(e.target.checked)}
          />
          Dry run
        </label>
        <label className="inline-flex items-center text-sm text-gray-700 ml-2">
          <span className="mr-2">Oddsmaker</span>
          <select
            value={providerId}
            onChange={(e) => setProviderId(e.target.value)}
            className="px-2 py-1 border rounded bg-white"
          >
            {oddsmakerOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </label>
        {jobResultProps && (
          <span className={`text-sm ${jobResultProps.success ? 'text-green-700' : 'text-red-700'}`}>
            {jobResultProps.success
              ? (dryRun
                ? `Props dry run: ${jobResultProps.results?.filter(r => r.status === 'dryRun').length || 0} would be created`
                : `Created ${jobResultProps.createdPropCount || 0} props`)
              : jobResultProps.error}
          </span>
        )}
        {jobResultPack && (
          <span className={`text-sm ${jobResultPack.success ? 'text-green-700' : 'text-red-700'}`}>
            {jobResultPack.success
              ? (dryRun
                ? `Pack dry run: no changes made`
                : (
                  jobResultPack.pack?.packURL
                    ? (
                      <>Pack {jobResultPack.pack.packURL} created/updated (
                        <a className="underline" href={`/admin/packs/${jobResultPack.pack.id}`} target="_blank" rel="noreferrer">Admin</a>
                        <span> · </span>
                        <a className="underline" href={`/packs/${jobResultPack.pack.packURL}`} target="_blank" rel="noreferrer">Public</a>
                      )</>
                    )
                    : 'Pack created/updated'
                  )
                )
              : jobResultPack.error}
          </span>
        )}
      </div>
      <div className="mb-4 flex flex-col md:flex-row md:items-end md:space-x-4">
        <div className="mb-2 md:mb-0">
          <label className="block text-sm font-medium text-gray-700">Filter Date</label>
          <div className="mt-1 flex items-center space-x-2">
            <input
              type="date"
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
              className="px-3 py-2 border rounded"
            />
            {selectedDate && (
              <button
                type="button"
                onClick={() => setSelectedDate('')}
                className="px-2 py-1 text-sm border rounded text-gray-700"
              >
                Clear
              </button>
            )}
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Quick Range</label>
          <div className="mt-1 flex items-center space-x-2">
            <select
              value={selectedQuickRange}
              onChange={(e) => {
                const v = e.target.value;
                setSelectedQuickRange(v);
                if (v) setSelectedDate('');
              }}
              className="px-3 py-2 border rounded"
            >
              <option value="">All Dates</option>
              <option value="today">Today</option>
              <option value="yesterday">Yesterday</option>
              <option value="tomorrow">Tomorrow</option>
              <option value="thisWeek">This Week</option>
            </select>
            {selectedQuickRange && (
              <button
                type="button"
                onClick={() => setSelectedQuickRange('')}
                className="px-2 py-1 text-sm border rounded text-gray-700"
              >
                Clear
              </button>
            )}
          </div>
        </div>
        <div className="flex-1">
          <label className="block text-sm font-medium text-gray-700">Search Title</label>
          <input
            type="text"
            placeholder="Filter by title..."
            value={filterText}
            onChange={e => setFilterText(e.target.value)}
            className="mt-1 px-3 py-2 border rounded w-full"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Sort by Time</label>
          <select
            value={sortOrder}
            onChange={e => setSortOrder(e.target.value)}
            className="mt-1 px-3 py-2 border rounded"
          >
            <option value="asc">Soonest</option>
            <option value="desc">Latest</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">League</label>
          <select
            value={selectedLeague}
            onChange={e => setSelectedLeague(e.target.value)}
            className="mt-1 px-3 py-2 border rounded"
          >
            <option value="">All Leagues</option>
            {leagueOptions.map(lg => (
              <option key={lg} value={lg}>{lg}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full bg-white">
          <thead>
            <tr>
              <th className="px-4 py-2 border">Cover</th>
              <th className="px-4 py-2 border">Title</th>
              <th className="px-4 py-2 border">Time</th>
              <th className="px-4 py-2 border">League</th>
              <th className="px-4 py-2 border">Props</th>
              <th className="px-4 py-2 border">Packs</th>
              <th className="px-4 py-2 border">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedEvents.map(ev => (
              <tr key={ev.id}>
                <td className="px-4 py-2 border">
                  {ev.eventCoverURL ? (
                    <img
                      src={ev.eventCoverURL}
                      alt="Event Cover"
                      className="h-10 w-10 object-cover rounded"
                    />
                  ) : (
                    <div className="h-10 w-10 bg-gray-100 border border-gray-200 rounded flex items-center justify-center text-xs text-gray-400">
                      N/A
                    </div>
                  )}
                </td>
                <td className="px-4 py-2 border">{ev.eventTitle}</td>
                <td className="px-4 py-2 border">{new Date(ev.eventTime).toLocaleString()}</td>
                <td className="px-4 py-2 border">{ev.eventLeague}</td>
                <td className="px-4 py-2 border">{ev.propCount ?? 0}</td>
                <td className="px-4 py-2 border">{ev.packCount ?? 0}</td>
                <td className="px-4 py-2 border">
                  <Link href={`/admin/events/${ev.id}`}>
                    <button className="px-2 py-1 text-blue-600 hover:underline mr-2">
                      Details
                    </button>
                  </Link>
                  <Link href={`/admin/events/${ev.id}/create-prop`}>
                    <button className="px-2 py-1 text-green-600 hover:underline mr-2">
                      Create Prop
                    </button>
                  </Link>
                  <Link href={`/admin/events/${ev.id}/wizard`}>
                    <button className="px-2 py-1 text-purple-600 hover:underline mr-2">
                      Wizard
                    </button>
                  </Link>
                  <Link href={`/admin/packs/new?eventId=${encodeURIComponent(ev.id)}`}>
                    <button className="px-2 py-1 text-indigo-600 hover:underline mr-2">
                      Create Pack
                    </button>
                  </Link>
                  <button
                    className="px-2 py-1 text-red-600 hover:underline"
                    onClick={async () => {
                      try {
                        const confirmDelete = window.confirm('Delete this event? This will unlink it from packs and props.');
                        if (!confirmDelete) return;
                        const res = await fetch(`/api/admin/events/${encodeURIComponent(ev.id)}`, { method: 'DELETE' });
                        const data = await res.json().catch(() => ({}));
                        if (!res.ok || !data?.success) {
                          throw new Error(data?.error || 'Failed to delete');
                        }
                        setEvents((prev) => prev.filter((e0) => e0.id !== ev.id));
                      } catch (err) {
                        console.error('Delete event failed', err?.message || err);
                        alert(err?.message || 'Failed to delete event');
                      }
                    }}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}