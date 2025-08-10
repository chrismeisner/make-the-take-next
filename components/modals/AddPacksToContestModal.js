import React, { useEffect, useMemo, useState } from "react";
import GlobalModal from "./GlobalModal";

export default function AddPacksToContestModal({ isOpen, onClose, initialSelected = [], onConfirm }) {
  const [packs, setPacks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(() => new Set(initialSelected));
  const [search, setSearch] = useState("");
  const [leagueFilter, setLeagueFilter] = useState("");

  useEffect(() => {
    let active = true;
    async function fetchPacks() {
      setLoading(true);
      setError("");
      try {
        // Fetch only from the Airtable "Open" view of Packs so admins pick currently open packs
        const resp = await fetch("/api/packs?view=Open");
        const data = await resp.json();
        if (!resp.ok || !data.success) throw new Error(data.error || "Failed to load packs");
        if (active) setPacks(data.packs || []);
      } catch (err) {
        if (active) setError(err.message);
      } finally {
        if (active) setLoading(false);
      }
    }
    fetchPacks();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    setSelected(new Set(initialSelected));
  }, [initialSelected]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return packs.filter((p) => {
      if (leagueFilter && (p.packLeague || "").toLowerCase() !== leagueFilter) return false;
      if (!q) return true;
      return (
        (p.packTitle || "").toLowerCase().includes(q) ||
        (p.packURL || "").toLowerCase().includes(q)
      );
    });
  }, [packs, search, leagueFilter]);

  function toggle(packURL) {
    setSelected((prev) => {
      const copy = new Set(prev);
      if (copy.has(packURL)) copy.delete(packURL);
      else copy.add(packURL);
      return copy;
    });
  }

  function handleConfirm() {
    if (typeof onConfirm === "function") {
      onConfirm(Array.from(selected));
    }
    onClose();
  }

  const leagues = useMemo(() => {
    return Array.from(new Set(packs.map((p) => (p.packLeague || "").toLowerCase()).filter(Boolean)));
  }, [packs]);

  return (
    <GlobalModal isOpen={isOpen} onClose={onClose} className="max-w-3xl">
      <div className="p-4">
        <h2 className="text-2xl font-bold mb-3">Add Packs to Contest</h2>
        <div className="flex flex-wrap gap-2 mb-3">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title or URL..."
            className="px-3 py-2 border rounded flex-1 min-w-[200px]"
          />
          <select
            value={leagueFilter}
            onChange={(e) => setLeagueFilter(e.target.value)}
            className="px-3 py-2 border rounded"
          >
            <option value="">All Leagues</option>
            {leagues.map((lg) => (
              <option key={lg} value={lg}>{lg.toUpperCase()}</option>
            ))}
          </select>
        </div>
        {loading ? (
          <p className="text-gray-600">Loading packs...</p>
        ) : error ? (
          <p className="text-red-600">Error: {error}</p>
        ) : (
          <div className="max-h-[60vh] overflow-auto border rounded">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-100 sticky top-0">
                <tr>
                  <th className="p-2 text-left">Select</th>
                  <th className="p-2 text-left">Title</th>
                  <th className="p-2 text-left">URL</th>
                  <th className="p-2 text-left">League</th>
                  <th className="p-2 text-left">Props</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-3 text-center text-gray-500">No packs found</td>
                  </tr>
                ) : (
                  filtered.map((p) => (
                    <tr key={p.airtableId} className="border-t">
                      <td className="p-2">
                        <input
                          type="checkbox"
                          checked={selected.has(p.packURL)}
                          onChange={() => toggle(p.packURL)}
                        />
                      </td>
                      <td className="p-2">{p.packTitle}</td>
                      <td className="p-2">{p.packURL}</td>
                      <td className="p-2">{p.packLeague || "-"}</td>
                      <td className="p-2">{p.propsCount ?? "-"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 bg-gray-500 text-white rounded">Close</button>
          <button onClick={handleConfirm} className="px-4 py-2 bg-blue-600 text-white rounded">Add Selected</button>
        </div>
      </div>
    </GlobalModal>
  );
}


