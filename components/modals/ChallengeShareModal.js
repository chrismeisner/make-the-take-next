import React from "react";
import GlobalModal from "./GlobalModal";

export default function ChallengeShareModal({ isOpen, onClose, packTitle, picksText, challengeUrl, propQuestion, sideTake }) {
  // Split picksText into individual lines for display
  const picksList = picksText ? picksText.split(/,\s*/) : [];

  // Share handler: native or fallback
  const handleShare = async () => {
    const message = sideTake
      ? `I just made the take: ${sideTake}. Think you know better? ${challengeUrl}`
      : picksText
        ? `I just made these picks: ${picksText}. Think you know better? ${challengeUrl}`
        : `Think you know better? ${challengeUrl}`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: `Challenge a friend: ${packTitle}`,
          text: message,
          url: challengeUrl,
        });
      } catch (err) {
        console.error("Error sharing", err);
      }
    } else {
      try {
        await navigator.clipboard.writeText(message);
        alert("Challenge message copied to clipboard");
      } catch (err) {
        console.error("Failed to copy", err);
      }
    }
  };

  return (
    <GlobalModal isOpen={isOpen} onClose={onClose}>
      <div className="p-4">
        <h2 className="text-2xl font-bold mb-4">Challenge a friend!</h2>
        {propQuestion && (
          <p className="mb-2 font-medium">Question: {propQuestion}</p>
        )}
        {picksList.length > 0 && (
          <>
            <p className="mb-2 font-medium">My picks:</p>
            <ul className="list-disc list-inside mb-4">
              {picksList.map((line, idx) => (
                <li key={idx}>{line}</li>
              ))}
            </ul>
          </>
        )}
        {sideTake && (
          <p className="mb-2 font-medium">Take: {sideTake}</p>
        )}
        <p className="break-all text-blue-600 underline mb-4">{challengeUrl}</p>
        <div className="flex justify-end">
          <button
            onClick={handleShare}
            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
          >
            Share Challenge
          </button>
        </div>
      </div>
    </GlobalModal>
  );
} 