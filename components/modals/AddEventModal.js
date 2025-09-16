import React, { useState, useEffect } from "react";
import GlobalModal from "./GlobalModal";

export default function AddEventModal({ isOpen, onClose, onEventSelected, allowMultiSelect = false, initialLeague = '', initialDate = '' }) {
  const [leagues, setLeagues] = useState([]);
  const [selectedLeague, setSelectedLeague] = useState(initialLeague || "");
  const [events, setEvents] = useState([]);
  const [loadingLeagues, setLoadingLeagues] = useState(false);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [fetchingRemote, setFetchingRemote] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [selectedDate, setSelectedDate] = useState(() => {
    if (initialDate) return initialDate;
    // Initialize to local date string (YYYY-MM-DD) accounting for timezone offset
    const now = new Date();
    const tzOffsetMs = now.getTimezoneOffset() * 60000;
    return new Date(now.getTime() - tzOffsetMs).toISOString().slice(0,10);
  });
  // NFL week selection state
  const [seasonYear, setSeasonYear] = useState(() => new Date().getFullYear());
  const [selectedWeek, setSelectedWeek] = useState(""); // e.g., "1", "2"
  const [weekRange, setWeekRange] = useState(null); // { start: 'YYYY-MM-DD', end: 'YYYY-MM-DD' }

  function computeFirstTuesdayOnOrAfterSep1(year) {
    const d = new Date(Date.UTC(year, 8, 1)); // Sep 1
    // 2 = Tuesday (0 Sun)
    const day = d.getUTCDay();
    const add = (9 - day) % 7; // days to next Tuesday (if already Tue, 0)
    d.setUTCDate(d.getUTCDate() + add);
    return d;
  }

  function formatYyyyMmDdUTC(date) {
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(date.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  }

  // When week changes, compute a simple NFL week range (Tue-Mon) starting from first Tuesday on/after Sep 1
  useEffect(() => {
    const leagueLower = String(selectedLeague || '').toLowerCase();
    if (leagueLower !== 'nfl' || !selectedWeek) {
      setWeekRange(null);
      return;
    }
    const base = computeFirstTuesdayOnOrAfterSep1(Number(seasonYear));
    const start = new Date(base.getTime() + (Number(selectedWeek) - 1) * 7 * 24 * 60 * 60 * 1000);
    const end = new Date(start.getTime() + 6 * 24 * 60 * 60 * 1000);
    setWeekRange({ start: formatYyyyMmDdUTC(start), end: formatYyyyMmDdUTC(end) });
  }, [selectedLeague, selectedWeek, seasonYear]);

  // Default NFL selection to 2025 Week 1 when NFL is chosen
  useEffect(() => {
    const leagueLower = String(selectedLeague || '').toLowerCase();
    if (leagueLower === 'nfl') {
      if (!selectedWeek) setSelectedWeek('1');
      if (seasonYear !== 2025) setSeasonYear(2025);
    }
  }, [selectedLeague]);

  if (!isOpen) return null;

  useEffect(() => {
    setLoadingLeagues(true);
    fetch('/api/admin/eventLeagues')
      .then(res => res.json())
      .then(data => { if (data.success) setLeagues(data.leagues); })
      .catch(err => console.error(err))
      .finally(() => setLoadingLeagues(false));
  }, [isOpen]);

  // Filter events by selected date

  // Fetch events by league and date or week range
  useEffect(() => {
    if (!selectedLeague) return;
    const leagueLower = String(selectedLeague).toLowerCase();
    setLoadingEvents(true);
    async function load() {
      try {
        const tz = 'America/New_York';
        if (leagueLower === 'nfl' && weekRange?.start && weekRange?.end) {
          // Build list of dates from start to end inclusive
          const start = new Date(weekRange.start + 'T00:00:00Z');
          const end = new Date(weekRange.end + 'T00:00:00Z');
          const dates = [];
          for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
            dates.push(formatYyyyMmDdUTC(d));
          }
          const results = await Promise.all(dates.map((dStr) =>
            fetch(`/api/admin/eventsByDate?date=${encodeURIComponent(dStr)}&league=${encodeURIComponent(selectedLeague)}&tz=${encodeURIComponent(tz)}`)
              .then(r => r.json()).catch(() => null)
          ));
          const merged = [];
          (results || []).forEach(r => { if (r?.success && Array.isArray(r.events)) merged.push(...r.events); });
          setEvents(merged);
        } else if (selectedDate) {
          const tz = 'America/New_York';
          const resp = await fetch(`/api/admin/eventsByDate?date=${encodeURIComponent(selectedDate)}&league=${encodeURIComponent(selectedLeague)}&tz=${encodeURIComponent(tz)}`);
          const data = await resp.json();
          if (data.success) setEvents(data.events);
        } else {
          setEvents([]);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoadingEvents(false);
      }
    }
    load();
  }, [selectedLeague, selectedDate, weekRange?.start, weekRange?.end, reloadKey]);

  const toggleSelected = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleAddSelected = () => {
    const chosen = events
      .filter((e) => selectedIds.has(e.id))
      .map(e => ({ id: e.id, eventTitle: e.eventTitle, eventTime: e.eventTime, eventLeague: e.eventLeague }));
    if (chosen.length === 0) return;
    if (typeof onEventSelected === 'function') {
      onEventSelected(chosen);
    }
    onClose();
  };

  return (
    <GlobalModal isOpen={true} onClose={onClose}>
      <h2 className="text-2xl font-bold mb-4">Add Event</h2>
      {/* League selection */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700">League</label>
        {loadingLeagues ? (
          <p>Loading leagues...</p>
        ) : (
          <select
            value={selectedLeague}
            onChange={e => setSelectedLeague(e.target.value)}
            className="mt-1 px-3 py-2 border rounded w-full"
          >
            <option value="">Select a league</option>
            {leagues.map(lg => (
              <option key={lg} value={lg}>{lg}</option>
            ))}
          </select>
        )}
      </div>
      {/* NFL Week selection */}
      {String(selectedLeague || '').toLowerCase() === 'nfl' && (
        <div className="mb-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
            <div>
              <label className="block text-sm font-medium text-gray-700">Season Year</label>
              <input
                type="number"
                value={seasonYear}
                onChange={(e) => setSeasonYear(Number(e.target.value) || new Date().getFullYear())}
                className="mt-1 px-3 py-2 border rounded w-full"
                min="2000"
                max="2100"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Week</label>
              <select
                value={selectedWeek}
                onChange={(e) => setSelectedWeek(e.target.value)}
                className="mt-1 px-3 py-2 border rounded w-full"
              >
                <option value="">(none)</option>
                {Array.from({ length: 22 }, (_, i) => i + 1).map((w) => (
                  <option key={w} value={String(w)}>Week {w}</option>
                ))}
              </select>
            </div>
            {weekRange && (
              <div className="text-sm text-gray-700">
                <div className="font-medium">Range</div>
                <div>{weekRange.start} → {weekRange.end}</div>
              </div>
            )}
          </div>
        </div>
      )}
      {/* Events list */}
      {selectedLeague && (
        <>
          {/* Date filter */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700">Filter by Date</label>
            <div className="mt-1 flex items-center space-x-2">
              <input
                type="date"
                value={selectedDate}
                onChange={e => setSelectedDate(e.target.value)}
                className="px-3 py-2 border rounded"
                disabled={String(selectedLeague || '').toLowerCase() === 'nfl' && !!selectedWeek}
                title={String(selectedLeague || '').toLowerCase() === 'nfl' && !!selectedWeek ? 'Disabled when a week is selected' : ''}
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
            {String(selectedLeague || '').toLowerCase() === 'nfl' && selectedWeek && weekRange && (
              <div className="mt-2 text-xs text-gray-600">Filtering week {selectedWeek}: {weekRange.start} to {weekRange.end}</div>
            )}
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700">Events</label>
            {loadingEvents ? (
              <p>Loading events...</p>
            ) : events.length ? (
              <ul className="mt-1 space-y-2 max-h-64 overflow-y-auto">
                {events.map(ev => (
                  <li key={ev.id} className="flex items-center">
                    {allowMultiSelect ? (
                      <input
                        type="checkbox"
                        className="mr-2"
                        checked={selectedIds.has(ev.id)}
                        onChange={() => toggleSelected(ev.id)}
                      />
                    ) : null}
                    <button
                      type="button"
                      onClick={() => {
                        if (allowMultiSelect) {
                          toggleSelected(ev.id);
                        } else {
                          onEventSelected({ id: ev.id, eventTitle: ev.eventTitle, eventTime: ev.eventTime, eventLeague: ev.eventLeague });
                          onClose();
                        }
                      }}
                      className="px-3 py-2 w-full text-left hover:bg-gray-100 rounded flex items-center"
                    >
                      <div className="flex items-center space-x-1 mr-2">
                        {ev.homeTeamLogo && <img src={ev.homeTeamLogo} alt="" className="h-6 w-6" />}
                        {ev.awayTeamLogo && <img src={ev.awayTeamLogo} alt="" className="h-6 w-6" />}
                      </div>
                      <div className="flex-1 flex flex-col">
                        <span className="font-medium">{ev.eventTitle}</span>
                        <span className="text-sm text-gray-500">{new Date(ev.eventTime).toLocaleString()}</span>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div>
                <p>No events found for this league and date.</p>
                {String(selectedLeague || '').toLowerCase() === 'nfl' ? (
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        setFetchingRemote(true);
                        const res = await fetch('/api/admin/fetchNflEvents', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ year: Number(seasonYear), week: Number(selectedWeek || 1), generateCovers: true })
                        });
                        const data = await res.json();
                        if (!res.ok || !data?.success) throw new Error(data?.error || 'Fetch failed');
                        // Reload list
                        setReloadKey((k) => k + 1);
                      } catch (e) {
                        console.error(e);
                        alert(e.message || 'Failed to fetch events');
                      } finally {
                        setFetchingRemote(false);
                      }
                    }}
                    disabled={fetchingRemote}
                    className={`mt-2 px-3 py-2 rounded text-white ${fetchingRemote ? 'bg-gray-400' : 'bg-indigo-600 hover:bg-indigo-700'}`}
                  >
                    {fetchingRemote ? 'Fetching…' : 'Fetch events'}
                  </button>
                ) : null}
              </div>
            )}
          </div>
        </>
      )}
      <div className="mt-4 flex justify-end space-x-2">
        {allowMultiSelect && (
          <button
            onClick={handleAddSelected}
            disabled={selectedIds.size === 0}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            Add Selected
          </button>
        )}
        <button
          onClick={onClose}
          className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
        >
          Close
        </button>
      </div>
    </GlobalModal>
  );
}