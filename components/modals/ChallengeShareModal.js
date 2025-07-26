import React from "react";
import GlobalModal from "./GlobalModal";

export default function ChallengeShareModal({ isOpen, onClose, packTitle, picksText, challengeUrl }) {
  // Split picksText into individual lines for display
  const picksList = picksText ? picksText.split(/,\s*/) : [];

  // Share handler: native or fallback
  const handleShare = async () => {
    const message = picksText
      ? `My picks: ${picksText}. Can you beat my score on ${packTitle}? ${challengeUrl}`
      : `Can you beat my score on ${packTitle}? ${challengeUrl}`;

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
        <p className="mb-4">Can you beat my score on <strong>{packTitle}</strong>?</p>
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