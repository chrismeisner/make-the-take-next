import GlobalModal from "./GlobalModal";

export default function SharePackModal(props) {
  const { isOpen, onClose, packTitle, packSummary, packUrl } = props;
  const baseUrl = packUrl || (typeof window !== 'undefined' ? window.location.href : '');
  const shareUrl = baseUrl;

  const handleSystemShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: packTitle || 'Check out this pack', text: packSummary || '', url: shareUrl });
      } else {
        await navigator.clipboard.writeText(shareUrl);
        alert('Link copied to clipboard');
      }
    } catch (e) {
      // Swallow; user can try copy
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      alert('Link copied to clipboard');
    } catch (e) {}
  };

  return (
    <GlobalModal isOpen={isOpen} onClose={onClose}>
      <h2 className="text-xl font-bold mb-2">Share Pack</h2>
      {packTitle && <p className="text-sm text-gray-700 mb-2">{packTitle}</p>}
      {packSummary && <p className="text-xs text-gray-600 mb-4">{packSummary}</p>}
      <div className="flex items-center gap-2">
        <button onClick={handleSystemShare} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Share</button>
        <button onClick={handleCopy} className="px-4 py-2 bg-gray-200 text-gray-900 rounded hover:bg-gray-300">Copy link</button>
        <button onClick={onClose} className="ml-auto px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600">Close</button>
      </div>
    </GlobalModal>
  );
}


