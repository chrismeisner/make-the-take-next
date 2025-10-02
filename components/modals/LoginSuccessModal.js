import React from 'react';
import GlobalModal from './GlobalModal';

// Simple success modal shown after a successful login
// Props:
// - isOpen: boolean
// - onClose: () => void
// - title?: string
// - message?: string
export default function LoginSuccessModal({ isOpen, onClose, title = 'Logged in', message = 'You are now signed in.' }) {
  return (
    <GlobalModal isOpen={isOpen} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <h2 className="text-2xl font-bold">{title}</h2>
        <p>{message}</p>
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </GlobalModal>
  );
}


