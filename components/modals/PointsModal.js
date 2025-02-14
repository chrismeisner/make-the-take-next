// File: /components/modals/PointsModal.js
import React from "react";
import GlobalModal from "./GlobalModal";

/**
 * PointsModal
 * - isOpen: boolean => whether the modal is open
 * - onClose: function => called when user clicks overlay or close button
 * - points: number => how many points the user currently has
 */
export default function PointsModal({ isOpen, onClose, points }) {
  return (
	<GlobalModal isOpen={isOpen} onClose={onClose}>
	  <h2 className="text-xl font-bold mb-2">Your Points</h2>
	  <p className="text-sm text-gray-700">
		You currently have <strong>{points}</strong> points.
	  </p>
	  <button
		onClick={onClose}
		className="mt-4 px-4 py-2 bg-blue-600 text-white rounded"
	  >
		Close
	  </button>
	</GlobalModal>
  );
}
