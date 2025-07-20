import React from 'react';

export default function ChallengeFriendButton({ packTitle }) {
  const handleShare = async () => {
    const shareData = {
      title: packTitle,
      text: `Hey! Can you take this pack "${packTitle}"?`,
      url: window.location.href,
    };
    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch (error) {
        console.error('Error sharing:', error);
      }
    } else {
      // Fallback: open SMS compose
      const smsBody = encodeURIComponent(`${shareData.text} ${shareData.url}`);
      window.location.href = `sms:&body=${smsBody}`;
    }
  };

  return (
    <button
      type="button"
      onClick={handleShare}
      className="mt-4 w-full bg-blue-500 text-white font-semibold py-2 px-4 rounded-md hover:bg-blue-600"
    >
      Challenge a Friend
    </button>
  );
} 