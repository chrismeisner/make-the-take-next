import React from 'react';
import { useRouter } from 'next/router';
import GlobalModal from './GlobalModal';

export default function MarketplaceInfoModal({ isOpen, onClose, item, tokenBalance = 0, onGo }) {
  const router = useRouter();
  if (!item) return null;
  const cost = Number(item.itemTokens) || 0;
  const balance = Number(tokenBalance) || 0;
  const remaining = Math.max(cost - balance, 0);
  const canRedeem = balance >= cost && cost > 0;

  return (
    <GlobalModal isOpen={isOpen} onClose={onClose}>
      <h2 className="text-xl font-semibold mb-2">Marketplace</h2>
      <p className="text-gray-700 mb-3">
        Earn tokens by making correct takes. Tokens are awarded as 5% of points won. When you have enough tokens, you can redeem items from the marketplace.
      </p>
      <div className="mb-3 p-3 rounded border bg-gray-50">
        <div className="text-sm text-gray-600">Selected item</div>
        <div className="font-medium">{item.itemName}</div>
        <div className="text-sm text-gray-700 mt-1"><strong>Cost:</strong> {cost} tokens</div>
        <div className="text-sm text-gray-700 mt-1"><strong>Your balance:</strong> {balance} tokens</div>
        {remaining > 0 ? (
          <div className="text-sm text-gray-700 mt-1"><strong>Needed:</strong> {remaining} more tokens</div>
        ) : (
          <div className="text-sm text-green-700 mt-1"><strong>Ready:</strong> You have enough tokens to redeem this item.</div>
        )}
        <div className="mt-2 w-full bg-gray-200 rounded-full h-2">
          <div className={`h-2 rounded-full ${canRedeem ? 'bg-green-600' : 'bg-blue-600'}`} style={{ width: `${Math.min((balance / (cost || 1)) * 100, 100)}%` }} />
        </div>
      </div>
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 rounded border"
        >
          Close
        </button>
        <button
          type="button"
          onClick={() => {
            onClose();
            router.push(`/redeem?itemID=${item.itemID}`);
          }}
          disabled={!canRedeem}
          className="px-4 py-2 rounded text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
        >
          Redeem Now
        </button>
      </div>
    </GlobalModal>
  );
}


