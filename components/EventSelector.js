import React, { useState, useEffect } from 'react';

export default function EventSelector({ selectedEvent, onSelect, league }) {
  const [open, setOpen] = useState(false);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [sortOrder, setSortOrder] = useState('asc');
  const [filterDate, setFilterDate] = useState(() => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  });
  // New loading state for fetching from ESPN/Airtable
  const [fetchingEvents, setFetchingEvents] = useState(false);

  // Encapsulate loading Airtable events
  const loadEvents = () => {
    setLoading(true);
    setError(null);
    // Determine endpoint based on selected league: filter Airtable custom events by league or default to ESPN MLB
    const url = league
      ? `/api/admin/eventsByDate?date=${filterDate}&league=${encodeURIComponent(league.toLowerCase())}`
      : `/api/events?date=${filterDate}`;
    fetch(url)
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          const sorted = data.events.slice().sort(
            (a, b) => new Date(a.eventTime) - new Date(b.eventTime)
          );
          setEvents(sorted);
        } else {
          setError(data.error);
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  // Handler to sync fresh events from ESPN/Airtable based on selected league and then reload list
  const handleFetchLeagueEvents = async () => {
    console.log(`[EventSelector] ESPN search requested: league=${league}, date=${filterDate}`);
    setFetchingEvents(true);
    try {
      const dateStr = filterDate.replace(/-/g, '');
      const leagueLower = league?.toLowerCase();
      let endpoint;
      if (leagueLower === 'nfl') {
        endpoint = '/api/admin/fetchNflEvents';
      } else if (leagueLower === 'mlb') {
        endpoint = '/api/admin/fetchMlbEvents';
      } else {
        // Fallback to MLB if unknown league
        endpoint = '/api/admin/fetchMlbEvents';
      }
      console.log(`[EventSelector] Fetching ESPN events from ${endpoint} with payload: { date: ${dateStr} }`);
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: dateStr }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
    } catch (err) {
      setError(err.message);
    } finally {
      setFetchingEvents(false);
      loadEvents();
    }
  };

  // Add handler to fetch custom events from Airtable
  const handleCheckAirtable = async () => {
    console.log(`[EventSelector] Airtable search requested: league=${league}, date=${filterDate}`);
    setLoading(true);
    setError(null);
    try {
      const url = `/api/admin/eventsByDate?date=${filterDate}${league ? `&league=${encodeURIComponent(league.toLowerCase())}` : ''}`;
      console.log(`[EventSelector] Fetching Airtable events from ${url}`);
      const res = await fetch(url);
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      const sorted = data.events.slice().sort((a, b) => new Date(a.eventTime) - new Date(b.eventTime));
      setEvents(sorted);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      loadEvents();
    }
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={!league}
        className={`mt-1 px-2 py-1 bg-gray-200 rounded ${!league ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        {selectedEvent ? 'Change Event' : 'Add Event'}
      </button>

      {open && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-4 rounded max-w-md w-full">
            <h2 className="text-xl font-bold mb-4">
              {league ? `Select ${league.toUpperCase()} Event` : 'Select Event'}
            </h2>
            {loading ? (
              <p>Loading events...</p>
            ) : error ? (
              <p className="text-red-600">{error}</p>
            ) : (
              <>
                <div className="mb-4">
                  <label htmlFor="sortOrder" className="block text-sm font-medium text-gray-700">Sort By</label>
                  <select
                    id="sortOrder"
                    value={sortOrder}
                    onChange={(e) => setSortOrder(e.target.value)}
                    className="mt-1 block w-full border rounded px-2 py-1"
                  >
                    <option value="asc">Soonest First</option>
                    <option value="desc">Latest First</option>
                  </select>
                </div>
                <div className="mb-4">
                  <label htmlFor="filterDate" className="block text-sm font-medium text-gray-700">Filter by Date</label>
                  <input
                    id="filterDate"
                    type="date"
                    value={filterDate}
                    onChange={(e) => setFilterDate(e.target.value)}
                    className="mt-1 block w-full border rounded px-2 py-1"
                  />
                </div>
                <div className="mb-4 text-right">
                  <button
                    type="button"
                    onClick={handleFetchLeagueEvents}
                    disabled={fetchingEvents}
                    className="px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                  >
                    {fetchingEvents
                      ? `Refreshing${league ? ` ${league}` : ''} Events (ESPN)...`
                      : `Get${league ? ` ${league}` : ''} Events (ESPN)`}
                  </button>
                  <button
                    type="button"
                    onClick={handleCheckAirtable}
                    disabled={loading}
                    className="ml-2 px-3 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                  >
                    {loading
                      ? `Checking${league ? ` ${league}` : ''} Events (Airtable)...`
                      : `Check${league ? ` ${league}` : ''} Events (Airtable)`}
                  </button>
                </div>
                <ul className="max-h-64 overflow-y-auto space-y-2">
                  {events
                    .filter((evt) => {
                      if (!evt.eventTime) return false;
                      const d = new Date(evt.eventTime);
                      const yyyy = d.getFullYear();
                      const mm = String(d.getMonth() + 1).padStart(2, '0');
                      const dd = String(d.getDate()).padStart(2, '0');
                      return `${yyyy}-${mm}-${dd}` === filterDate;
                    })
                    .sort((a, b) =>
                      sortOrder === 'asc'
                        ? new Date(a.eventTime) - new Date(b.eventTime)
                        : new Date(b.eventTime) - new Date(a.eventTime)
                    )
                    .map((evt) => (
                      <li key={evt.id}>
                        <button
                          type="button"
                          onClick={() => {
                            onSelect(evt);
                            setOpen(false);
                          }}
                          className="w-full flex items-center space-x-2 px-2 py-1 hover:bg-gray-100 rounded"
                        >
                          {evt.awayTeamLogo && (
                            <img src={evt.awayTeamLogo} alt={evt.awayTeam} className="w-6 h-6 object-contain" />
                          )}
                          {evt.homeTeamLogo && (
                            <img src={evt.homeTeamLogo} alt={evt.homeTeam} className="w-6 h-6 object-contain" />
                          )}
                          <div className="flex-1 text-left">
                            <div>{evt.eventTitle}</div>
                            <div className="text-sm text-gray-500">{new Date(evt.eventTime).toLocaleString()}</div>
                          </div>
                        </button>
                      </li>
                    ))}
                </ul>
              </>
            )}
            <div className="mt-4 text-right">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="px-3 py-1 bg-gray-300 rounded hover:bg-gray-400"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
} 