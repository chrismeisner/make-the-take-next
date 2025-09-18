import React from "react";
import Link from "next/link";
import GlobalModal from "./GlobalModal";
import useCountdown from "../../hooks/useCountdown";

export default function PackActiveModal({ isOpen, onClose, packTitle, packURL, coverUrl, packCloseTime }) {
  const hasCloseTime = !!packCloseTime;
  const { days, hours, minutes, seconds, isCompleted } = hasCloseTime ? useCountdown(packCloseTime) : { days: 0, hours: 0, minutes: 0, seconds: 0, isCompleted: false };
  const renderCountdown = hasCloseTime && !isCompleted;
  return (
    <GlobalModal isOpen={isOpen} onClose={onClose} className="p-6 sm:p-8 max-w-lg w-[92%] sm:w-full">
      <div className="text-center">
        <h2 className="text-2xl sm:text-3xl font-bold mb-2">Pack active now!</h2>
        <p className="text-gray-700 text-sm sm:text-base mb-4">Make your take on this open pack now.</p>
        {renderCountdown ? (
          <div className="inline-flex items-center justify-center gap-2 text-sm sm:text-base mb-4 px-3 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
            <span>Closes in</span>
            <span className="font-semibold">
              {days > 0 ? `${days}d ` : ''}{String(hours).padStart(2,'0')}:{String(minutes).padStart(2,'0')}:{String(seconds).padStart(2,'0')}
            </span>
          </div>
        ) : null}
        {coverUrl ? (
          <div className="mb-4 w-48 h-48 mx-auto overflow-hidden rounded-lg shadow-md">
            <img src={coverUrl} alt={packTitle || "Pack cover"} className="w-full h-full object-cover" />
          </div>
        ) : null}
        {packTitle ? (
          <div className="text-lg font-semibold mb-4">{packTitle}</div>
        ) : null}
        {packURL ? (
          <Link href={`/packs/${packURL}`}>
            <button
              onClick={onClose}
              className="w-full sm:w-auto px-6 py-3 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Open pack
            </button>
          </Link>
        ) : null}
      </div>
    </GlobalModal>
  );
}


