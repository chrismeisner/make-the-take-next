import React, { useMemo, useState } from "react";
import GlobalModal from "./GlobalModal";

export default function NewInventoryModal({ isOpen, onClose, items = [], onAdded }) {
  const [selectedItemId, setSelectedItemId] = useState(items?.[0]?.itemID || "");
  const [bulkText, setBulkText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  const options = useMemo(() => {
    return (Array.isArray(items) ? items : []).map((it) => ({
      id: it.itemID,
      label: it.itemName ? `${it.itemName} (${it.itemID})` : it.itemID,
    }));
  }, [items]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setResult(null);
    const itemID = String(selectedItemId || "").trim();
    const codes = String(bulkText || "")
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!itemID) {
      setError("Please select an item");
      return;
    }
    if (codes.length === 0) {
      setError("Please provide at least one code");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/items/${encodeURIComponent(itemID)}/codes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codes }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to add inventory");
      }
      setResult({ added: data.added, totalProvided: data.totalProvided });
      setBulkText("");
      if (typeof onAdded === "function") {
        try { onAdded({ itemID, added: data.added }); } catch {}
      }
    } catch (err) {
      setError(err?.message || "Error adding inventory");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <GlobalModal isOpen={isOpen} onClose={onClose}>
      <h2 className="text-xl font-bold mb-3">Add Inventory Codes</h2>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-gray-700">Item</label>
          <select
            value={selectedItemId}
            onChange={(e) => setSelectedItemId(e.target.value)}
            className="mt-1 block w-full rounded border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          >
            {options.map((opt) => (
              <option key={opt.id} value={opt.id}>{opt.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Codes (one per line)</label>
          <textarea
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            rows={10}
            className="mt-1 block w-full rounded border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            placeholder={`ABC-123\nDEF-456\n...`}
          />
        </div>

        {error && (
          <div className="text-sm text-red-700">{error}</div>
        )}
        {result && (
          <div className="text-sm text-green-700">Added {result.added} of {result.totalProvided} codes.</div>
        )}

        <div className="pt-2 flex gap-2">
          <button
            type="submit"
            disabled={submitting}
            className={`px-4 py-2 rounded text-white ${submitting ? 'bg-gray-400' : 'bg-green-600 hover:bg-green-700'}`}
          >
            {submitting ? 'Adding…' : 'Add Inventory'}
          </button>
          <button type="button" onClick={onClose} className="px-4 py-2 rounded border">Close</button>
        </div>
      </form>
    </GlobalModal>
  );
}


