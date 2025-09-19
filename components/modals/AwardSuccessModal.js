import React from 'react';
import GlobalModal from './GlobalModal';
import Link from 'next/link';

export default function AwardSuccessModal({ isOpen, onClose, name, tokens = 0, error = '', redirectTeamSlug = null }) {
  const success = !error && Number(tokens) > 0;
  return (
    <GlobalModal isOpen={isOpen} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <h2 className="text-2xl font-bold">{success ? 'Bonus added!' : 'Bonus status'}</h2>
        {success ? (
          <p>
            You received <span className="font-semibold">+{tokens}</span> marketplace tokens from {name}.
          </p>
        ) : (
          <p className="text-red-600">{error || 'Already claimed or unavailable.'}</p>
        )}
        <div className="flex gap-2 mt-2">
          {redirectTeamSlug ? (
            <Link href={`/teams/${encodeURIComponent(redirectTeamSlug)}`} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Go to Team</Link>
          ) : (
            <Link href="/" className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Home</Link>
          )}
          <Link href="/" className="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300">Close</Link>
        </div>
      </div>
    </GlobalModal>
  );
}


