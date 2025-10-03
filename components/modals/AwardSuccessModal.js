import React from 'react';
import GlobalModal from './GlobalModal';
import Link from 'next/link';
// MarketplacePreview removed from this modal

export default function AwardSuccessModal({ isOpen, onClose, name, tokens = 0, error = '', redirectTeamSlug = null, imageUrl = null, already = false }) {
  const success = !error && Number(tokens) > 0;
  return (
    <GlobalModal isOpen={isOpen} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <h2 className="text-2xl font-bold">{success ? (already ? 'Bonus already claimed' : 'Bonus added!') : 'Bonus status'}</h2>
        {imageUrl ? (
          <div className="w-full flex justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageUrl} alt={name || 'Award'} className="max-h-40 object-contain rounded" />
          </div>
        ) : null}
        {(success || already) ? (
          <p>
            {already ? (
              <>You already claimed <span className="font-semibold">+{tokens}</span> marketplace tokens from {name}.</>
            ) : (
              <>You received <span className="font-semibold">+{tokens}</span> marketplace tokens from {name}.</>
            )}
          </p>
        ) : (
          <p className="text-red-600">{error || 'Already claimed or unavailable.'}</p>
        )}
        {/* Remove Featured Reward preview; provide navigation actions instead */}
        <div className="flex gap-2 mt-2">
          {/* Go to team page and close modal (if provided) */}
          {redirectTeamSlug ? (
            <Link
              href={`/teams/${encodeURIComponent(redirectTeamSlug)}`}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              onClick={() => { try { onClose?.(); } catch (_) {} }}
            >
              Go to Team
            </Link>
          ) : null}
          {/* Go to team marketplace page (if team provided) */}
          {redirectTeamSlug ? (
            <Link
              href={`/marketplace?teamSlug=${encodeURIComponent(redirectTeamSlug)}`}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
              onClick={() => { try { onClose?.(); } catch (_) {} }}
            >
              Team Marketplace
            </Link>
          ) : (
            <Link href="/marketplace" className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700">Marketplace</Link>
          )}
        </div>
      </div>
    </GlobalModal>
  );
}


