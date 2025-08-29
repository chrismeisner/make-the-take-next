import React from "react";
import QRCode from "react-qr-code";

export default function QRCodeModal({ isOpen, onClose, url, title }) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black opacity-50"
        onClick={onClose}
      ></div>
      {/* Full-screen content */}
      <div className="relative bg-white w-full h-full p-4 flex flex-col items-center justify-center">
        <div className="absolute top-0 left-0 right-0 p-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold truncate mr-4">{title || 'Share Pack'}</h3>
          <button
            className="text-gray-600 text-3xl leading-none"
            onClick={onClose}
            aria-label="Close"
          >
            &times;
          </button>
        </div>
        <div className="p-4 bg-white rounded mt-8">
          <QRCode value={url} size={256} />
        </div>
        <p className="mt-4 text-center break-all text-sm text-gray-700">{url}</p>
      </div>
    </div>
  );
} 