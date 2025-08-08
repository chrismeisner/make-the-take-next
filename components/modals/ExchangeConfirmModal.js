import React, { useState } from "react";
import GlobalModal from "./GlobalModal";

export default function ExchangeConfirmModal({ isOpen, onClose, item, onConfirm }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleConfirm() {
    if (!onConfirm) return;
    setSubmitting(true);
    setError("");
    try {
      await onConfirm();
    } catch (err) {
      setError(err?.message || "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  if (!item) return null;

  return (
    <GlobalModal isOpen={isOpen} onClose={onClose}>
      <h2 className="text-xl font-semibold mb-2">Confirm Redemption</h2>
      <p className="text-gray-700 mb-4">
        Redeem <span className="font-semibold">{item.itemName}</span> for {item.itemTokens} diamonds?
      </p>
      {error ? (
        <div className="mb-3 p-2 rounded bg-red-100 text-red-800 text-sm">{error}</div>
      ) : null}
      <div className="flex gap-2 justify-end">
        <button
          onClick={onClose}
          className="px-4 py-2 rounded bg-gray-200 text-gray-800"
          disabled={submitting}
        >
          Cancel
        </button>
        <button
          onClick={handleConfirm}
          className={`px-4 py-2 rounded ${submitting ? "bg-blue-300" : "bg-blue-600 hover:bg-blue-700"} text-white`}
          disabled={submitting}
        >
          {submitting ? "Processing…" : "Confirm"}
        </button>
      </div>
    </GlobalModal>
  );
}


