import React, { useState, useEffect } from "react";

export default function ChallengeComponent({ packUrl, receiptId }) {
  const [shareUrl, setShareUrl] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const origin = window.location.origin;
      setShareUrl(`${origin}/packs/${packUrl}?ref=${receiptId}`);
    }
  }, [packUrl, receiptId]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Copy failed:", err);
    }
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ url: shareUrl });
      } catch (error) {
        console.error("Error sharing:", error);
      }
    }
  };

  return (
    <div className="flex space-x-2 mt-4">
      <button onClick={handleCopy} disabled={copied} className={`px-3 py-1 rounded ${copied ? 'bg-gray-500' : 'bg-blue-600'} text-white`}>
        {copied ? 'Copied!' : 'Copy link'}
      </button>
      <button onClick={handleShare} className="px-3 py-1 bg-green-600 text-white rounded block md:hidden">
        Share
      </button>
    </div>
  );
} 