import React, { useState, useEffect } from "react";
import GlobalModal from "./GlobalModal";

export default function AddPropModal({ isOpen, onClose, onPropsAdded, initialLeague }) {
  const [propsOptions, setPropsOptions] = useState([]);
  const [selectedProps, setSelectedProps] = useState([]);
  const [loadingProps, setLoadingProps] = useState(false);
  const [leagueFilter, setLeagueFilter] = useState(initialLeague || '');
  const [leagues, setLeagues] = useState([]);
  const [filterDate, setFilterDate] = useState(() => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  });

  useEffect(() => {
    if (!isOpen) return;
    setLoadingProps(true);
    fetch('/api/props?limit=100&view=Filtered')
      .then(res => res.json())
      .then(data => { if (data.success) {
        console.log('AddPropModal: fetched propsOptions:', data.props);
        setPropsOptions(data.props);
      } })
      .catch(err => console.error(err))
      .finally(() => setLoadingProps(false));
  }, [isOpen]);

  // Derive unique leagues for the league filter dropdown
  useEffect(() => {
    const uniqueLeagues = Array.from(new Set(propsOptions.map(p => p.eventLeague).filter(Boolean)));
    setLeagues(uniqueLeagues);
  }, [propsOptions]);

  if (!isOpen) return null;

  const toggleProp = (prop) => {
    setSelectedProps(prev =>
      prev.some(p => p.airtableId === prop.airtableId)
        ? prev.filter(p => p.airtableId !== prop.airtableId)
        : [...prev, prop]
    );
  };

  // Filter props by optional event day and league with local timezone handling
  const filteredProps = propsOptions.filter(p => {
    // date filter
    if (filterDate) {
      if (!p.eventTime) return false;
      const dt = new Date(p.eventTime);
      const yyyy = dt.getFullYear();
      const mm = String(dt.getMonth() + 1).padStart(2, '0');
      const dd = String(dt.getDate()).padStart(2, '0');
      if (`${yyyy}-${mm}-${dd}` !== filterDate) return false;
    }
    // league filter
    if (leagueFilter && p.eventLeague !== leagueFilter) return false;
    return true;
  });

  return (
    <GlobalModal isOpen={true} onClose={onClose}>
      <h2 className="text-2xl font-bold mb-4">Add Prop</h2>
      <div className="mb-4 flex items-center space-x-4">
        <div className="flex items-center space-x-2">
          <label className="block text-sm font-medium text-gray-700">Event Day</label>
          <input
            type="date"
            value={filterDate}
            onChange={e => setFilterDate(e.target.value)}
            className="mt-1 px-3 py-2 border rounded"
          />
          {filterDate && (
            <button
              type="button"
              onClick={() => setFilterDate('')}
              className="mt-1 px-2 py-1 bg-gray-200 rounded"
            >
              Clear
            </button>
          )}
        </div>
        <div className="flex items-center space-x-2">
          <label className="block text-sm font-medium text-gray-700">League</label>
          <select
            value={leagueFilter}
            onChange={e => setLeagueFilter(e.target.value)}
            className="mt-1 px-3 py-2 border rounded"
          >
            <option value="">All</option>
            {leagues.map(lg => (
              <option key={lg} value={lg}>{lg}</option>
            ))}
          </select>
          {leagueFilter && (
            <button
              type="button"
              onClick={() => setLeagueFilter('')}
              className="mt-1 px-2 py-1 bg-gray-200 rounded"
            >
              Clear
            </button>
          )}
        </div>
      </div>
      {loadingProps ? (
        <p>Loading props...</p>
      ) : (
        <div className="overflow-x-auto overflow-y-auto max-h-[60vh]">
          <table className="min-w-full bg-white">
            <thead>
              <tr>
                <th className="px-4 py-2 border">Prop Short</th>
                <th className="px-4 py-2 border">Event</th>
                <th className="px-4 py-2 border">League</th>
                <th className="px-4 py-2 border">Event Time</th>
                <th className="px-4 py-2 border">Select</th>
              </tr>
            </thead>
            <tbody>
              {filteredProps.length ? (
                filteredProps.map(p => (
                  <tr key={p.airtableId}>
                    <td className="px-4 py-2 border">{p.propShort || p.propTitle || p.propID}</td>
                    <td className="px-4 py-2 border">{p.eventTitle || '-'}</td>
                    <td className="px-4 py-2 border">{p.eventLeague || '-'}</td>
                    <td className="px-4 py-2 border">{p.eventTime ? new Date(p.eventTime).toLocaleString() : '-'}</td>
                    <td className="px-4 py-2 border text-center">
                      <input
                        type="checkbox"
                        checked={selectedProps.some(sp => sp.airtableId === p.airtableId)}
                        onChange={() => toggleProp(p)}
                      />
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-4 py-2 text-center text-gray-500">No open props available</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      <div className="sticky bottom-0 bg-white p-4 flex justify-end space-x-2">
        <button
          onClick={() => { onPropsAdded(selectedProps); onClose(); }}
          disabled={selectedProps.length === 0}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          Submit
        </button>
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