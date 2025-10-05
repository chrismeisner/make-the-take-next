import React, { useEffect, useState } from "react";
import GlobalModal from "./GlobalModal";
import { useRouter } from "next/router";

export default function UserTakesModal({ isOpen, onClose, packURL, profileID }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [items, setItems] = useState([]);
  const router = useRouter();

  useEffect(() => {
    if (!isOpen) return;
    if (!packURL || !profileID) return;
    let active = true;
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const qs = new URLSearchParams({ profileID });
        const res = await fetch(`/api/packs/${encodeURIComponent(packURL)}/userTakes?${qs.toString()}`);
        const json = await res.json();
        if (!active) return;
        if (!res.ok || !json?.success) throw new Error(json?.error || 'Failed to load');
        setItems(Array.isArray(json.items) ? json.items : []);
      } catch (e) {
        if (active) setError(e.message || 'Failed to load');
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, [isOpen, packURL, profileID]);

  return (
    <GlobalModal isOpen={isOpen} onClose={onClose}>
      <div className="p-4">
        <h3 className="text-lg font-semibold mb-1">{profileID}'s takes</h3>
        {profileID && (
          <p className="text-sm mb-3">
            <button
              type="button"
              onClick={() => { try { onClose && onClose(); } catch {} try { router.push(`/profile/${encodeURIComponent(profileID)}`); } catch {} }}
              className="text-blue-600 underline"
            >
              View full profile
            </button>
          </p>
        )}
        {loading ? (
          <div className="text-sm text-gray-600">Loading…</div>
        ) : error ? (
          <div className="text-sm text-red-600">{error}</div>
        ) : items.length === 0 ? (
          <div className="text-sm text-gray-600">No takes found for this pack.</div>
        ) : (
          <ul className="space-y-2">
            {items.map((it) => {
              const result = String(it.result || '').toLowerCase();
              const color = result === 'won' ? 'text-green-700' : result === 'lost' ? 'text-red-700' : result === 'pushed' ? 'text-yellow-700' : 'text-gray-700';
              return (
                <li key={it.propID} className="text-sm flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    {it.statement}
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className={`font-semibold ${color}`}>{result || 'pending'}</span>
                    <span className="text-gray-800 font-medium">{typeof it.points === 'number' ? it.points : 0} pts</span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </GlobalModal>
  );
}


