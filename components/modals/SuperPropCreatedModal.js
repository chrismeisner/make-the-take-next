import React from "react";
import GlobalModal from "./GlobalModal";

export default function SuperPropCreatedModal({ isOpen, onClose, url, onDone }) {
  const handleClose = () => {
    onClose();
    if (onDone) onDone();
  };

  return (
    <GlobalModal isOpen={isOpen} onClose={handleClose}>
      <h2 className="text-2xl font-bold mb-4">Super Prop Created Successfully</h2>
      <p className="mb-4">You can view it here:</p>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-600 underline break-all"
      >
        {url}
      </a>
      <div className="mt-4 text-right">
        <button
          onClick={handleClose}
          className="px-4 py-2 bg-blue-600 text-white rounded"
        >
          OK
        </button>
      </div>
    </GlobalModal>
  );
} 