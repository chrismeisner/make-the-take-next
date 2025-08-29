import React, { useState } from "react";
import GlobalModal from "./GlobalModal";

export default function NotifyMeModal({ isOpen, onClose, packTitle }) {
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!phone) return;
    setSubmitting(true);
    try {
      // Dummy submit for now
      await new Promise((r) => setTimeout(r, 600));
      setSubmitted(true);
    } catch {
      // ignore
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <GlobalModal isOpen={isOpen} onClose={onClose}>
      <h2 className="text-xl font-bold mb-2">Notify me</h2>
      <p className="text-sm text-gray-700 mb-4">
        Notify me when this pack drops{packTitle ? `: ${packTitle}` : ""}.
      </p>

      {submitted ? (
        <div>
          <p className="text-green-700 text-sm">Thanks! Well let you know.</p>
          <button
            className="mt-4 px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Mobile number
            </label>
            <input
              type="tel"
              placeholder="(555) 555-1234"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={!phone || submitting}
              className={[
                "px-4 py-2 rounded text-white",
                !phone || submitting ? "bg-gray-400 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700",
              ].join(" ")}
            >
              {submitting ? "Submitting..." : "Notify me"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded bg-gray-200 text-gray-900 hover:bg-gray-300"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </GlobalModal>
  );
}


