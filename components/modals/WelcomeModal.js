// File: /components/modals/WelcomeModal.js

import React from "react";
import { useRouter } from "next/router";
import GlobalModal from "./GlobalModal";

export default function WelcomeModal({ isOpen, onClose, contestHref = "/" }) {
  const router = useRouter();

  const handleGoToContests = async () => {
    try {
      onClose?.();
    } finally {
      router.push(contestHref);
    }
  };

  const handleGoToLeaderboards = async () => {
    try {
      onClose?.();
    } finally {
      router.push('/how-to-play');
    }
  };

  return (
    <GlobalModal isOpen={isOpen} onClose={onClose} className="p-6 sm:p-8 max-w-lg w-[92%] sm:w-full">
      <div className="text-center">
        <h2 className="text-2xl sm:text-3xl font-bold mb-4">Make the Take</h2>
        <p className="text-gray-700 text-sm sm:text-base mb-2">
          Pick a pack, make quick takes, and climb the leaderboard. 1st place wins the pack prize. Every correct take earns tokens for the marketplace.
        </p>
        <p className="text-gray-500 text-xs sm:text-sm">
          Takes lock when the game starts. Your latest take counts.
        </p>
      </div>

      <div className="flex justify-center gap-2 mt-2 sm:mt-4">
        <button
          onClick={handleGoToLeaderboards}
          className="w-full sm:w-auto px-4 py-2 rounded bg-gray-200 text-gray-900 hover:bg-gray-300"
        >
          How to play
        </button>
        <button
          onClick={handleGoToContests}
          className="w-full sm:w-auto px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700"
        >
          See Available Packs
        </button>
      </div>
    </GlobalModal>
  );
}


