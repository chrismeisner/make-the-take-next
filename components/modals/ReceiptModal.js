import React, { useEffect, useState } from "react";
import GlobalModal from "./GlobalModal";

export default function ReceiptModal({ isOpen, onClose, packURL, profileID }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [receiptId, setReceiptId] = useState(null);

  useEffect(() => {
    if (!isOpen) return;
    if (!packURL || !profileID) {
      setError("Missing packURL or profileID");
      return;
    }
    let isActive = true;
    async function resolve() {
      try {
        setLoading(true);
        setError(null);
        setReceiptId(null);
        const qs = new URLSearchParams({ packURL, profileID });
        const res = await fetch(`/api/receipts/resolve?${qs.toString()}`);
        const data = await res.json();
        if (!res.ok || !data?.success || !data?.receiptId) {
          throw new Error(data?.error || "Could not resolve receipt");
        }
        if (!isActive) return;
        setReceiptId(String(data.receiptId));
      } catch (e) {
        if (!isActive) return;
        setError(e.message || "Failed to load receipt");
      } finally {
        if (isActive) setLoading(false);
      }
    }
    resolve();
    return () => { isActive = false; };
  }, [isOpen, packURL, profileID]);

  const content = (() => {
    if (loading) {
      return <div className="p-4 text-sm text-gray-600">Loading…</div>;
    }
    if (error) {
      return <div className="p-4 text-sm text-red-600">{error}</div>;
    }
    if (receiptId) {
      const href = `/packs/${encodeURIComponent(packURL)}/${encodeURIComponent(receiptId)}`;
      return (
        <div className="w-full" style={{ height: "70vh" }}>
          <iframe
            title="Receipt"
            src={href}
            className="w-full h-full border-0 rounded"
          />
        </div>
      );
    }
    return null;
  })();

  return (
    <GlobalModal isOpen={isOpen} onClose={onClose}>
      <div className="p-2">
        <h3 className="text-lg font-semibold mb-2">User takes</h3>
        {content}
      </div>
    </GlobalModal>
  );
}


