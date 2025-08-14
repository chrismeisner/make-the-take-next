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

  return (
    <GlobalModal isOpen={isOpen} onClose={onClose} className="p-6 sm:p-8 max-w-lg w-[92%] sm:w-full">
      <div className="text-center">
        <h2 className="text-2xl sm:text-3xl font-bold mb-4">Welcome 👋</h2>
        <p className="text-gray-700 text-sm sm:text-base mb-6">
          Jump into the latest action.
        </p>
      </div>

      <div className="flex justify-center mt-2 sm:mt-4">
        <button
          onClick={handleGoToContests}
          className="w-full sm:w-auto px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700"
        >
          Contest
        </button>
      </div>
    </GlobalModal>
  );
}


