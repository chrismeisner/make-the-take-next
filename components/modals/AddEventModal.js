import React, { useState, useEffect } from "react";
import GlobalModal from "./GlobalModal";

export default function AddEventModal({ isOpen, onClose, onEventSelected }) {
  const [leagues, setLeagues] = useState([]);
  const [selectedLeague, setSelectedLeague] = useState("");
  const [events, setEvents] = useState([]);
  const [loadingLeagues, setLoadingLeagues] = useState(false);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [selectedDate, setSelectedDate] = useState(() => {
    // Initialize to local date string (YYYY-MM-DD) accounting for timezone offset
    const now = new Date();
    const tzOffsetMs = now.getTimezoneOffset() * 60000;
    return new Date(now.getTime() - tzOffsetMs).toISOString().slice(0,10);
  });

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

  // Fetch events by league and date
  useEffect(() => {
    if (!selectedLeague || !selectedDate) return;
    setLoadingEvents(true);
    fetch(`/api/admin/eventsByDate?date=${encodeURIComponent(selectedDate)}&league=${encodeURIComponent(selectedLeague)}`)
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          // Filter to local selectedDate (YYYY-MM-DD) to avoid timezone mismatches
          const filteredEvents = data.events.filter(ev => {
            const dt = new Date(ev.eventTime);
            return dt.toLocaleDateString('en-CA') === selectedDate;
          });
          setEvents(filteredEvents);
        }
      })
      .catch(err => console.error(err))
      .finally(() => setLoadingEvents(false));
  }, [selectedLeague, selectedDate]);

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
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700">Events</label>
            {loadingEvents ? (
              <p>Loading events...</p>
            ) : events.length ? (
              <ul className="mt-1 space-y-2 max-h-64 overflow-y-auto">
                {events.map(ev => (
                  <li key={ev.id}>
                    <button
                      type="button"
                      onClick={() => { onEventSelected({ id: ev.id, eventTitle: ev.eventTitle }); onClose(); }}
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
              <p>No events found for this league and date.</p>
            )}
          </div>
        </>
      )}
      <div className="mt-4 flex justify-end">
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