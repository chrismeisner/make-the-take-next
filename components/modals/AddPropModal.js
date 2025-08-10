import React, { useState, useEffect, useMemo } from "react";
import GlobalModal from "./GlobalModal";

export default function AddPropModal({ isOpen, onClose, onPropsAdded, initialLeague, excludeIds = [], viewName = 'Open' }) {
  const [propsOptions, setPropsOptions] = useState([]);
  const [selectedProps, setSelectedProps] = useState([]);
  const [loadingProps, setLoadingProps] = useState(false);
  const [leagueFilter, setLeagueFilter] = useState(initialLeague || '');
  const [leagues, setLeagues] = useState([]);
  // Default to no date filter so users see more options initially
  const [filterDate, setFilterDate] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortKey, setSortKey] = useState('eventTime'); // 'eventTime' | 'propShort' | 'eventTitle'
  const [sortDir, setSortDir] = useState('asc'); // 'asc' | 'desc'
  const [error, setError] = useState(null);
  const [nextOffset, setNextOffset] = useState(null);

  const loadProps = async (opts = { reset: false }) => {
    try {
      if (opts.reset) {
        setPropsOptions([]);
        setNextOffset(null);
      }
      setLoadingProps(true);
      setError(null);
      const url = `/api/props?limit=100&view=${encodeURIComponent(viewName)}${opts.reset ? '' : (nextOffset ? `&offset=${encodeURIComponent(nextOffset)}` : '')}`;
      const res = await fetch(url);
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || 'Failed to load props');
      }
      // Merge uniquely by airtableId
      const seen = new Set();
      const combined = [...(opts.reset ? [] : propsOptions), ...(data.props || [])].filter(p => {
        if (!p || !p.airtableId) return false;
        if (seen.has(p.airtableId)) return false;
        seen.add(p.airtableId);
        return true;
      });
      setPropsOptions(combined);
      setNextOffset(data.nextOffset || null);
    } catch (err) {
      setError(err?.message || 'Failed to load props');
    } finally {
      setLoadingProps(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    loadProps({ reset: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, viewName]);

  // Derive unique leagues for the league filter dropdown
  useEffect(() => {
    const uniqueLeagues = Array.from(new Set(propsOptions.map(p => p.eventLeague).filter(Boolean)));
    setLeagues(uniqueLeagues);
  }, [propsOptions]);

  if (!isOpen) return null;

  const excludedIdSet = useMemo(() => new Set(excludeIds.filter(Boolean)), [excludeIds]);

  const toggleProp = (prop) => {
    setSelectedProps(prev =>
      prev.some(p => p.airtableId === prop.airtableId)
        ? prev.filter(p => p.airtableId !== prop.airtableId)
        : [...prev, prop]
    );
  };

  // Filter, search, sort, and exclude existing selections
  const filteredProps = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    const lgFilter = (leagueFilter || '').toLowerCase();
    let list = propsOptions.filter(p => {
      if (!p) return false;
      // Exclude props that are already in the pack (by airtableId)
      if (p.airtableId && excludedIdSet.has(p.airtableId)) return false;
      // date filter
      if (filterDate) {
        if (!p.eventTime) return false;
        const dt = new Date(p.eventTime);
        const yyyy = dt.getFullYear();
        const mm = String(dt.getMonth() + 1).padStart(2, '0');
        const dd = String(dt.getDate()).padStart(2, '0');
        if (`${yyyy}-${mm}-${dd}` !== filterDate) return false;
      }
      // league filter (normalize case)
      if (lgFilter) {
        const pel = (p.eventLeague || '').toLowerCase();
        if (pel !== lgFilter) return false;
      }
      // text search across propShort and eventTitle
      if (term) {
        const a = (p.propShort || p.propTitle || '').toLowerCase();
        const b = (p.eventTitle || '').toLowerCase();
        if (!a.includes(term) && !b.includes(term)) return false;
      }
      return true;
    });
    // sort
    list.sort((a, b) => {
      let av;
      let bv;
      if (sortKey === 'propShort') {
        av = (a.propShort || a.propTitle || '').toLowerCase();
        bv = (b.propShort || b.propTitle || '').toLowerCase();
      } else if (sortKey === 'eventTitle') {
        av = (a.eventTitle || '').toLowerCase();
        bv = (b.eventTitle || '').toLowerCase();
      } else {
        av = a.eventTime ? new Date(a.eventTime).getTime() : 0;
        bv = b.eventTime ? new Date(b.eventTime).getTime() : 0;
      }
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return list;
  }, [propsOptions, excludedIdSet, filterDate, leagueFilter, searchTerm, sortKey, sortDir]);

  const isSelected = (id) => selectedProps.some(sp => sp.airtableId === id);
  const allSelectableVisible = filteredProps.length > 0 && filteredProps.every(p => isSelected(p.airtableId));

  const handleSelectAllVisible = () => {
    if (allSelectableVisible) {
      // clear all visible
      const visibleIds = new Set(filteredProps.map(p => p.airtableId));
      setSelectedProps(prev => prev.filter(sp => !visibleIds.has(sp.airtableId)));
    } else {
      // add all visible
      const currentIds = new Set(selectedProps.map(sp => sp.airtableId));
      const toAdd = filteredProps.filter(p => !currentIds.has(p.airtableId));
      setSelectedProps(prev => [...prev, ...toAdd]);
    }
  };

  const clearSelection = () => setSelectedProps([]);

  return (
    <GlobalModal isOpen={true} onClose={onClose}>
      <h2 className="text-2xl font-bold mb-4">Add Prop</h2>
      <div className="mb-4 flex items-center space-x-4 flex-wrap">
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
        <div className="flex items-center space-x-2">
          <label className="block text-sm font-medium text-gray-700">Search</label>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="prop or event"
            className="mt-1 px-3 py-2 border rounded"
          />
        </div>
        <div className="flex items-center space-x-2">
          <label className="block text-sm font-medium text-gray-700">Sort</label>
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value)}
            className="mt-1 px-3 py-2 border rounded"
          >
            <option value="eventTime">Event Time</option>
            <option value="eventTitle">Event</option>
            <option value="propShort">Prop</option>
          </select>
          <button
            type="button"
            onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')}
            className="mt-1 px-2 py-1 bg-gray-200 rounded"
            aria-label="Toggle sort direction"
            title="Toggle sort direction"
          >
            {sortDir === 'asc' ? '↑' : '↓'}
          </button>
        </div>
        <div className="ml-auto flex items-center space-x-2">
          <button
            type="button"
            onClick={handleSelectAllVisible}
            className="mt-1 px-3 py-2 bg-gray-100 border rounded"
          >
            {allSelectableVisible ? 'Unselect All' : 'Select All'}
          </button>
          <button
            type="button"
            onClick={clearSelection}
            className="mt-1 px-3 py-2 bg-gray-100 border rounded"
          >
            Clear Selection
          </button>
        </div>
      </div>
      {error && (
        <div className="mb-3 p-3 bg-red-50 text-red-700 border border-red-200 rounded">{error}</div>
      )}
      {loadingProps && propsOptions.length === 0 ? (
        <p>Loading props...</p>
      ) : (
        <>
          <div className="mb-2 text-sm text-gray-600">
            Showing {filteredProps.length} props. Selected {selectedProps.length}.
          </div>
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
                          checked={isSelected(p.airtableId)}
                          onChange={() => toggleProp(p)}
                        />
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="px-4 py-2 text-center text-gray-500">No props match the current filters</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex items-center justify-between">
            <div className="text-xs text-gray-500">
              {nextOffset ? 'More results available' : 'All results loaded'}
            </div>
            <button
              type="button"
              disabled={!nextOffset || loadingProps}
              onClick={() => loadProps({ reset: false })}
              className="px-3 py-2 bg-gray-100 border rounded disabled:opacity-50"
            >
              {loadingProps ? 'Loading…' : 'Load more'}
            </button>
          </div>
        </>
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