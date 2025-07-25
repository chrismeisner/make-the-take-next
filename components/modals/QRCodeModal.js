import React from "react";
import QRCode from "react-qr-code";

export default function QRCodeModal({ isOpen, onClose, url }) {
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
        <button
          className="absolute top-4 right-4 text-gray-600 text-3xl"
          onClick={onClose}
        >
          &times;
        </button>
        <div className="p-4 bg-white rounded">
          <QRCode value={url} size={256} />
        </div>
        <p className="mt-4 text-center break-all text-sm text-gray-700">{url}</p>
      </div>
    </div>
  );
} 