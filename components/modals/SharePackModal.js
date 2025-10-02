import GlobalModal from "./GlobalModal";
import { useModal } from "../../contexts/ModalContext";
import { useSession } from "next-auth/react";
import { useEffect, useMemo, useState } from "react";

export default function SharePackModal({ isOpen, onClose, packTitle, packSummary, packUrl, packLeague, packCloseTime, packOpenSmsTemplate }) {
  const { data: session } = useSession();
  const baseUrl = packUrl || (typeof window !== 'undefined' ? window.location.href : '');
  // Append ?ref=<profileID> for logged-in users
  let shareUrl = baseUrl;
  try {
    if (session?.user?.profileID && typeof window !== 'undefined') {
      const url = new URL(baseUrl, window.location.origin);
      url.searchParams.set('ref', session.user.profileID);
      shareUrl = url.toString();
    }
  } catch {}
  const { openModal } = useModal();

  function humanizeTimeDelta(toTs) {
    try {
      const now = Date.now();
      const target = new Date(toTs).getTime();
      if (!Number.isFinite(target)) return '';
      let diffMs = target - now;
      if (diffMs <= 0) return 'now';
      const minutes = Math.floor(diffMs / 60000);
      const days = Math.floor(minutes / (60 * 24));
      const hours = Math.floor((minutes % (60 * 24)) / 60);
      const mins = Math.floor(minutes % 60);
      if (days >= 2) return `${days} days`;
      if (days === 1) return hours > 0 ? `1 day ${hours}h` : '1 day';
      if (hours >= 2) return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
      if (hours === 1) return mins > 0 ? `1h ${mins}m` : '1h';
      if (mins >= 1) return `${mins}m`;
      return 'soon';
    } catch { return ''; }
  }

  function renderTemplate(tpl, vars) {
    let out = String(tpl || '');
    Object.keys(vars || {}).forEach((k) => {
      out = out.replaceAll(`{${k}}`, String(vars[k] ?? ''));
    });
    return out;
  }

  const smsCopy = useMemo(() => {
    const template = packOpenSmsTemplate || '{packTitle} is open; {timeLeft} to make your takes {packUrl}';
    const timeLeft = packCloseTime ? humanizeTimeDelta(packCloseTime) : 'now';
    const league = (packLeague || '').toLowerCase();
    // Use baseUrl to mirror broadcast SMS (no referral param)
    return renderTemplate(template, { packTitle: packTitle || 'New Pack', packUrl: baseUrl, league, timeLeft });
  }, [packOpenSmsTemplate, packCloseTime, packLeague, packTitle, shareUrl]);

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
  const handleGenerateQR = () => {
    openModal('qrCode', { url: shareUrl, title: packTitle || 'Share Pack' });
  };

  return (
    <GlobalModal isOpen={isOpen} onClose={onClose}>
      <h2 className="text-xl font-bold mb-2">Share Pack</h2>
      {packTitle && <p className="text-sm text-gray-700 mb-2">{packTitle}</p>}
      {packSummary && <p className="text-xs text-gray-600 mb-4">{packSummary}</p>}
      <div className="mb-4">
        <h3 className="text-sm font-semibold mb-1">SMS Copy</h3>
        <textarea readOnly value={smsCopy} className="w-full px-3 py-2 border rounded text-sm h-24" onFocus={(e) => e.target.select()} />
        <p className="mt-1 text-xs text-gray-500">This mirrors the broadcast SMS copy for this pack drop.</p>
      </div>
      <div className="mb-3">
        <input
          type="text"
          readOnly
          value={shareUrl}
          className="w-full px-3 py-2 border rounded text-sm"
          onFocus={(e) => e.target.select()}
        />
        <p className="mt-2 text-xs text-gray-600">When someone uses your link, <span className="font-semibold">you</span> get <span className="font-semibold">+5</span> marketplace tokens.</p>
      </div>
      <div className="flex items-center gap-2">
        <button onClick={handleSystemShare} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Share</button>
        <button onClick={handleCopy} className="px-4 py-2 bg-gray-200 text-gray-900 rounded hover:bg-gray-300">Copy link</button>
        <button onClick={handleGenerateQR} className="px-4 py-2 bg-gray-800 text-white rounded hover:bg-black">Generate QR</button>
        <button onClick={onClose} className="ml-auto px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600">Close</button>
      </div>
    </GlobalModal>
  );
}


