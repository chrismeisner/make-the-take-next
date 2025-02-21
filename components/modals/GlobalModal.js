//components/modals/GlobalModal.js

import React from "react";

export default function GlobalModal({ isOpen, onClose, children }) {
  if (!isOpen) return null;
  return (
	<div className="fixed inset-0 z-50 flex items-center justify-center">
	  {/* Overlay */}
	  <div
		className="absolute inset-0 bg-black opacity-50"
		onClick={onClose}
	  ></div>
	  {/* Content */}
	  <div className="relative bg-white p-4 rounded shadow-lg z-50 max-w-2xl w-full">
		<button
		  className="absolute top-2 right-2 text-gray-600 text-xl"
		  onClick={onClose}
		>
		  &times;
		</button>
		{children}
	  </div>
	</div>
  );
}
