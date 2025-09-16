import React, { useEffect, useMemo, useState } from "react";
import GlobalModal from "./GlobalModal";
import { useSession } from "next-auth/react";

export default function PackGradedModal({ isOpen, onClose, packTitle, packProps = [], packURL }) {
  const { data: session } = useSession();
  const [userTakes, setUserTakes] = useState([]);
  const [loading, setLoading] = useState(false);
  const isLoggedIn = Boolean(session?.user?.phone);
  const profileID = session?.user?.profileID;
  const [shareUrl, setShareUrl] = useState("");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!isOpen || !isLoggedIn) return;
      setLoading(true);
      try {
        const res = await fetch('/api/userTakes');
        const json = await res.json();
        if (!cancelled && res.ok && json.success) {
          setUserTakes(Array.isArray(json.takes) ? json.takes : []);
        }
      } catch (e) {
        // noop
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [isOpen, isLoggedIn]);

  useEffect(() => {
    if (!isOpen) return;
    if (!packURL || !profileID) return;
    try {
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      (async () => {
        try {
          const resp = await fetch('/api/shareLink', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ packURL, profileID })
          });
          const data = await resp.json();
          if (resp.ok && data.success && data.shareId) {
            if (origin) setShareUrl(`${origin}/${packURL}/${data.shareId}`);
          } else {
            if (origin) setShareUrl(`${origin}/packs/${packURL}/user/${profileID}`);
          }
        } catch {
          if (origin) setShareUrl(`${origin}/packs/${packURL}/user/${profileID}`);
        }
      })();
    } catch {}
  }, [isOpen, packURL, profileID]);

  const takesByPropId = useMemo(() => {
    const map = new Map();
    for (const t of userTakes) {
      if (t?.propID) map.set(String(t.propID), t);
    }
    return map;
  }, [userTakes]);

  const totals = useMemo(() => {
    let pts = 0;
    let toks = 0;
    for (const p of packProps) {
      const t = takesByPropId.get(String(p.propID));
      if (!t) continue;
      pts += Number(t.takePts || 0);
      toks += Number(t.tokens || 0);
    }
    return { pts, toks };
  }, [packProps, takesByPropId]);

  const record = useMemo(() => {
    let won = 0;
    let lost = 0;
    let pushed = 0;
    for (const p of packProps) {
      const t = takesByPropId.get(String(p.propID));
      if (!t) continue;
      const r = String(t.takeResult || '').toLowerCase();
      if (r === 'won') won += 1;
      else if (r === 'lost') lost += 1;
      else if (r === 'pushed' || r === 'push') pushed += 1;
    }
    return { won, lost, pushed };
  }, [packProps, takesByPropId]);

  return (
    <GlobalModal isOpen={isOpen} onClose={onClose}>
      <div className="p-4">
        <h2 className="text-2xl font-bold mb-4">Pack graded</h2>
        <p className="mb-4">Results are in for <strong>{packTitle}</strong>.</p>
        {isLoggedIn && (
          <div className="mb-4">
            <h3 className="text-lg font-semibold mb-2">Your results</h3>
            {!loading && (
              <div className="mb-2 text-sm">
                <span className="font-medium">Total points:</span> {totals.pts}
                <span className="ml-4 font-medium">Tokens:</span> {totals.toks}
                <span className="ml-4 font-medium">Record:</span> {record.won}-{record.lost}-{record.pushed}
              </div>
            )}
            {shareUrl && (
              <div className="mb-3">
                <label className="block text-sm font-medium mb-1">Share link</label>
                <div className="flex items-center gap-2">
                  <input
                    readOnly
                    value={shareUrl}
                    className="w-full rounded border border-gray-300 px-2 py-1 text-sm text-gray-800 bg-gray-50"
                  />
                  <button
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(shareUrl);
                        alert('Link copied to clipboard');
                      } catch {}
                    }}
                    className="px-3 py-1.5 text-sm bg-gray-700 text-white rounded hover:bg-gray-800"
                  >
                    Copy link
                  </button>
                </div>
              </div>
            )}
            {loading ? (
              <p className="text-sm text-gray-600">Loading…</p>
            ) : (
              <ul className="space-y-2 max-h-64 overflow-auto pr-1">
                {packProps.map((p) => {
                  const t = takesByPropId.get(String(p.propID));
                  if (!t) return null;
                  const label = p.propShort || p.propTitle || p.propID;
                  const side = t.propSide === 'A' ? (p.sideALabel || 'A') : (t.propSide === 'B' ? (p.sideBLabel || 'B') : t.propSide);
                  const result = t.takeResult || 'pending';
                  const color = result === 'won' ? 'text-green-700' : result === 'lost' ? 'text-red-700' : result === 'pushed' ? 'text-yellow-700' : 'text-gray-700';
                  return (
                    <li key={p.propID} className="text-sm">
                      <span className="font-medium">{label}</span>
                      <span className="ml-2 text-gray-600">({side})</span>
                      <span className={`ml-2 font-semibold ${color}`}>{result}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
        <div className="flex justify-end gap-2">
          {isLoggedIn && packURL && (
            <button
              onClick={async () => {
                if (!shareUrl) return;
                const text = `My results on ${packTitle}: ${record.won}-${record.lost}-${record.pushed}.`;
                if (navigator.share) {
                  try {
                    await navigator.share({ title: `My ${packTitle} results`, text, url: shareUrl });
                  } catch {}
                } else {
                  try {
                    await navigator.clipboard.writeText(`${text} ${shareUrl}`);
                    alert('Link copied to clipboard');
                  } catch {}
                }
              }}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
            >
              Share
            </button>
          )}
          <button
            onClick={onClose}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            OK
          </button>
        </div>
      </div>
    </GlobalModal>
  );
}


