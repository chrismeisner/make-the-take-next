// File: /components/modals/GlobalModal.js
import React from "react";

/**
 * GlobalModal renders its children in a centered overlay.
 * 
 * Props:
 *  - isOpen: boolean (whether the modal is open)
 *  - onClose: function (called when the overlay or close button is clicked)
 *  - children: the content of the modal
 */
export default function GlobalModal({ isOpen, onClose, children }) {
  if (!isOpen) return null; // Don't render if not open

  return (
	<div className="fixed inset-0 z-50 flex items-center justify-center">
	  {/* Overlay */}
	  <div
		className="absolute inset-0 bg-black bg-opacity-50"
		onClick={onClose}
	  />
	  {/* Content container with a wider max width */}
	  <div className="relative bg-white w-full max-w-4xl mx-auto rounded shadow-lg p-4 z-50">
		{/* Close Button */}
		<button
		  onClick={onClose}
		  className="absolute top-2 right-2 text-gray-500 hover:text-gray-800"
		>
		  <span className="sr-only">Close</span>
		  &times;
		</button>
		{children}
	  </div>
	</div>
  );
}
