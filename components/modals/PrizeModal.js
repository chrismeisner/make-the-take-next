// File: /components/modals/PrizeModal.js
import React from "react";
import GlobalModal from "./GlobalModal";

/**
 * Shows a single prize's info
 * - isOpen: boolean
 * - onClose: function
 * - prize: {
 *    prizeTitle,
 *    prizeIMGs,
 *    prizePTS,
 *    ...
 * }
 */
export default function PrizeModal({ isOpen, onClose, prize }) {
  if (!prize) {
	// If we have no prize data, just show a fallback
	return (
	  <GlobalModal isOpen={isOpen} onClose={onClose}>
		<h2 className="text-xl font-bold mb-2">No Prize Found</h2>
		<p className="text-sm text-gray-700">No available prize at this time.</p>
		<button
		  className="mt-4 px-4 py-2 bg-blue-600 text-white rounded"
		  onClick={onClose}
		>
		  Close
		</button>
	  </GlobalModal>
	);
  }

  const { prizeTitle, prizeIMGs, prizePTS } = prize;

  return (
	<GlobalModal isOpen={isOpen} onClose={onClose}>
	  <h2 className="text-xl font-bold mb-2">Available Prize</h2>
	  {prizeIMGs && prizeIMGs.length > 0 && (
		<img
		  src={prizeIMGs[0].url}
		  alt={prizeTitle}
		  className="w-full h-32 object-cover rounded mb-2"
		/>
	  )}
	  <p className="text-lg font-semibold">{prizeTitle}</p>
	  <p className="text-sm text-gray-600">
		Requires {prizePTS} points to redeem.
	  </p>
	  <button
		className="mt-4 px-4 py-2 bg-blue-600 text-white rounded"
		onClick={onClose}
	  >
		Close
	  </button>
	</GlobalModal>
  );
}
