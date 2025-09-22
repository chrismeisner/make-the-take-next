import GlobalModal from "./GlobalModal";

export default function ReferralChallengeModal({
  isOpen,
  onClose,
  refUsername,
  packTitle,
  onPlay,
}) {
  const handlePlay = () => {
    if (typeof onPlay === 'function') {
      onPlay();
    }
  };

  return (
    <GlobalModal isOpen={isOpen} onClose={onClose}>
      <div className="space-y-3">
        <h2 className="text-xl font-bold">You're invited!</h2>
        <p className="text-gray-700 text-sm">
          You've been challenged by <span className="font-semibold">@{refUsername || 'someone'}</span> on <span className="font-semibold">{packTitle || 'this pack'}</span>.
        </p>
        <p className="text-gray-700 text-sm">Make your takes now.</p>
        <div className="flex items-center gap-2">
          <button
            onClick={handlePlay}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Play this pack
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 text-gray-900 rounded hover:bg-gray-300"
          >
            Not now
          </button>
        </div>
      </div>
    </GlobalModal>
  );
}


