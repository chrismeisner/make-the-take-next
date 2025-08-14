import GlobalModal from "./GlobalModal";
import { useModal } from "../../contexts/ModalContext";

export default function ShareContestModal({ isOpen, onClose, contestTitle, contestSummary, contestUrl }) {
  const { openModal } = useModal();
  const url = contestUrl || (typeof window !== 'undefined' ? window.location.href : '');

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      alert('Link copied to clipboard');
    } catch (e) {
      console.error('Copy failed', e);
    }
  };

  const handleSystemShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: contestTitle, text: contestSummary || 'Check out this contest', url });
        onClose?.();
      } else {
        await handleCopy();
      }
    } catch (e) {
      console.error('Share failed', e);
    }
  };

  const handleGenerateQR = () => {
    // Replace this modal with a full-screen QR modal
    openModal('qrCode', { url });
  };

  return (
    <GlobalModal isOpen={isOpen} onClose={onClose}>
      <h2 className="text-xl font-bold mb-2">Share Contest</h2>
      <p className="text-sm text-gray-700 mb-4">{contestTitle}</p>
      {contestSummary && (
        <p className="text-sm text-gray-600 mb-4">{contestSummary}</p>
      )}

      <div className="space-y-2">
        <button
          onClick={handleSystemShare}
          className="w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Share via System
        </button>
        <button
          onClick={handleGenerateQR}
          className="w-full px-4 py-2 bg-black text-white rounded hover:bg-gray-900"
        >
          Generate QR
        </button>
        <button
          onClick={handleCopy}
          className="w-full px-4 py-2 border border-gray-300 rounded text-gray-700 hover:bg-gray-50"
        >
          Copy Link
        </button>
        <input
          readOnly
          value={url}
          className="w-full mt-2 px-3 py-2 border border-gray-200 rounded text-sm"
        />
      </div>
    </GlobalModal>
  );
}



