import React, { useState } from "react";
import GlobalModal from "./GlobalModal";

export default function GetPackWinnersModal({ isOpen, onClose, packs = [] }) {
  const [selected, setSelected] = useState(() => new Set());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  function toggle(id) {
    setSelected(prev => {
      const copy = new Set(prev);
      if (copy.has(id)) copy.delete(id);
      else copy.add(id);
      return copy;
    });
  }

  async function handleGetWinners() {
    setSubmitting(true);
    setError("");
    setResult(null);
    try {
      const packIds = packs
        .filter(p => selected.has(p.airtableId))
        .map(p => ({ airtableId: p.airtableId, packURL: p.packURL }));
      const res = await fetch("/api/admin/setPackWinners", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packs: packIds }),
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || "Failed to set winners");
      }
      setResult({ updated: data.updatedCount, errors: data.errors || [] });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <GlobalModal isOpen={isOpen} onClose={onClose}>
      <h2 className="text-xl font-bold mb-3">Graded Packs Without Winners</h2>
      <p className="text-sm text-gray-600 mb-3">
        Select the graded packs with no winner to compute and assign winners.
      </p>
      <div className="max-h-80 overflow-auto border rounded">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-100 sticky top-0">
            <tr>
              <th className="p-2 text-left">Select</th>
              <th className="p-2 text-left">Title</th>
              <th className="p-2 text-left">Pack URL</th>
              <th className="p-2 text-left">Props</th>
              <th className="p-2 text-left">Takes</th>
            </tr>
          </thead>
          <tbody>
            {packs.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-3 text-center text-gray-500">No graded packs missing winners</td>
              </tr>
            ) : (
              packs.map((p) => (
                <tr key={p.airtableId} className="border-t">
                  <td className="p-2">
                    <input
                      type="checkbox"
                      checked={selected.has(p.airtableId)}
                      onChange={() => toggle(p.airtableId)}
                    />
                  </td>
                  <td className="p-2">{p.packTitle || p.packURL || p.airtableId}</td>
                  <td className="p-2">{p.packURL}</td>
                  <td className="p-2">{p.propsCount ?? "-"}</td>
                  <td className="p-2">{p.takeCount ?? "-"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      {result && (
        <div className="mt-3 text-sm">
          <p className="text-green-700">Updated {result.updated} packs.</p>
          {result.errors?.length > 0 && (
            <ul className="mt-2 text-red-600 list-disc list-inside">
              {result.errors.map((e, idx) => (
                <li key={idx}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div className="mt-4 flex justify-end space-x-2">
        <button
          onClick={onClose}
          className="px-4 py-2 bg-gray-500 text-white rounded"
        >
          Close
        </button>
        <button
          onClick={handleGetWinners}
          disabled={submitting || selected.size === 0}
          className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50"
        >
          {submitting ? "Processing..." : "Get Winners"}
        </button>
      </div>
    </GlobalModal>
  );
}


