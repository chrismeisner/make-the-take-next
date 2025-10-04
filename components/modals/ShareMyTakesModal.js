import React, { useMemo } from "react";
import GlobalModal from "./GlobalModal";
import { useSession } from "next-auth/react";

export default function ShareMyTakesModal({ isOpen, onClose, packTitle, packUrl, packProps = [], userTakes = [] }) {
  const { data: session } = useSession();

  const shareUrl = useMemo(() => {
    try {
      const base = packUrl || (typeof window !== 'undefined' ? window.location.href : '');
      if (!base) return '';
      const u = new URL(base, typeof window !== 'undefined' ? window.location.origin : undefined);
      if (session?.user?.profileID) u.searchParams.set('ref', session.user.profileID);
      return u.toString();
    } catch {
      return packUrl || '';
    }
  }, [packUrl, session?.user?.profileID]);

  const takesList = useMemo(() => {
    const propById = new Map();
    (Array.isArray(packProps) ? packProps : []).forEach((p) => {
      // Map by prop record id from Postgres stored in airtableId
      if (p && (p.airtableId || p.id)) {
        propById.set(String(p.airtableId || p.id), p);
      }
    });
    const seen = new Set();
    const items = [];
    (Array.isArray(userTakes) ? userTakes : []).forEach((t) => {
      const key = String(t.propId || t.prop_id || '')
      if (!key || seen.has(key)) return;
      seen.add(key);
      const prop = propById.get(key);
      if (!prop) return;
      const side = String(t.side || t.prop_side || '').toUpperCase() === 'B' ? 'B' : 'A';
      const statement = side === 'A' ? (prop.propSideATake || prop.sideALabel || 'Side A') : (prop.propSideBTake || prop.sideBLabel || 'Side B');
      const label = prop.propTitle || 'Prop';
      items.push({ label, statement });
    });
    return items;
  }, [packProps, userTakes]);

  const headerLine = useMemo(() => (
    `Here's my 🏟️ ${packTitle} ⚡️ Takes`
  ), [packTitle]);

  const shareText = useMemo(() => {
    const lines = [];
    lines.push(headerLine);
    lines.push("");
    if (takesList.length > 0) {
      takesList.forEach((t) => {
        if (t?.statement) {
          lines.push(`🔮 ${t.statement}`);
        }
      });
    }
    lines.push("");
    lines.push(`Make Your Take ⚡️ ${shareUrl}`);
    return lines.join("\n");
  }, [headerLine, takesList, shareUrl]);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareText);
      alert('Copied to clipboard');
    } catch {}
  };

  const onNativeShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: headerLine, text: shareText });
      } else {
        await onCopy();
      }
    } catch {}
  };

  return (
    <GlobalModal isOpen={isOpen} onClose={onClose}>
      <div className="p-2">
        <h2 className="text-xl font-semibold mb-3">Share my takes</h2>
        <div className="mb-3">
          <label className="block text-sm font-medium text-gray-700 mb-1">Preview</label>
          <textarea
            readOnly
            value={shareText}
            className="w-full border rounded p-2 text-sm text-gray-800"
            rows={Math.min(12, Math.max(6, shareText.split('\n').length + 1))}
          />
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onCopy} className="px-3 py-2 rounded bg-gray-200 text-gray-900 text-sm hover:bg-gray-300">Copy</button>
          <button onClick={onNativeShare} className="px-3 py-2 rounded bg-indigo-600 text-white text-sm hover:bg-indigo-700">Share</button>
        </div>
      </div>
    </GlobalModal>
  );
}


