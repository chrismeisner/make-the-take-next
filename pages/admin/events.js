import { useSession } from 'next-auth/react';
import { useState, useEffect } from 'react';
import Link from 'next/link';

export default function AdminEventsPage() {
  const { data: session, status } = useSession();
  const [events, setEvents] = useState([]);
  const [selectedDate, setSelectedDate] = useState(() => new Date().toLocaleDateString('en-CA'));
  const [filterText, setFilterText] = useState('');
  const [sortOrder, setSortOrder] = useState('asc');
  const [selectedLeague, setSelectedLeague] = useState('');

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

  const filteredEvents = events.filter(ev =>
    ev.eventTitle.toLowerCase().includes(filterText.toLowerCase()) &&
    (selectedLeague === '' || ev.eventLeague === selectedLeague) &&
    (selectedDate === '' || new Date(ev.eventTime).toLocaleDateString('en-CA') === selectedDate)
  );
  const sortedEvents = [...filteredEvents].sort((a, b) => {
    const dateA = new Date(a.eventTime);
    const dateB = new Date(b.eventTime);
    return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
  });
  const leagueOptions = Array.from(new Set(events.map(ev => ev.eventLeague).filter(Boolean)));

  return (
    <div className="container mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold mb-4">Events Management</h1>
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
              <th className="px-4 py-2 border">Title</th>
              <th className="px-4 py-2 border">Time</th>
              <th className="px-4 py-2 border">League</th>
              <th className="px-4 py-2 border">Props</th>
              <th className="px-4 py-2 border">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedEvents.map(ev => (
              <tr key={ev.id}>
                <td className="px-4 py-2 border">{ev.eventTitle}</td>
                <td className="px-4 py-2 border">{new Date(ev.eventTime).toLocaleString()}</td>
                <td className="px-4 py-2 border">{ev.eventLeague}</td>
                <td className="px-4 py-2 border">{ev.propCount ?? 0}</td>
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
                  <button className="px-2 py-1 text-red-600 hover:underline">
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