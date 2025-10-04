import React, { useEffect, useMemo, useState } from "react";
import GlobalModal from "./GlobalModal";
import { useSession } from "next-auth/react";

export default function PackGradedModal({ isOpen, onClose, packTitle, packProps = [] }) {
  const { data: session } = useSession();
  const [userTakes, setUserTakes] = useState([]);
  const [loading, setLoading] = useState(false);
  const isLoggedIn = Boolean(session?.user?.phone);
  

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
        <h2 className="text-2xl font-bold mb-4">
          {session?.user?.profileID ? (
            <>
              {session.user.profileID}, your takes have been graded
            </>
          ) : (
            'Your takes have been graded'
          )}
        </h2>
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
            {loading ? (
              <p className="text-sm text-gray-600">Loading…</p>
            ) : (
              <div className="max-h-64 overflow-auto pr-1">
                <table className="min-w-full text-sm">
                  <thead className="sticky top-0 bg-gray-50">
                    <tr>
                      <th className="text-left font-medium px-2 py-1">Prop</th>
                      <th className="text-left font-medium px-2 py-1">Side</th>
                      <th className="text-left font-medium px-2 py-1">Result</th>
                      <th className="text-right font-medium px-2 py-1">Points</th>
                      <th className="text-right font-medium px-2 py-1">Tokens</th>
                    </tr>
                  </thead>
                  <tbody>
                    {packProps.map((p) => {
                      const t = takesByPropId.get(String(p.propID));
                      if (!t) return null;
                      const label = p.propShort || p.propTitle || p.propID;
                      const side = t.propSide === 'A' ? (p.sideALabel || 'A') : (t.propSide === 'B' ? (p.sideBLabel || 'B') : t.propSide);
                      const result = t.takeResult || 'pending';
                      const color = result === 'won' ? 'text-green-700' : result === 'lost' ? 'text-red-700' : result === 'pushed' ? 'text-yellow-700' : 'text-gray-700';
                      return (
                        <tr key={p.propID} className="border-t border-gray-200">
                          <td className="px-2 py-1"><span className="font-medium">{label}</span></td>
                          <td className="px-2 py-1 text-gray-600">{side}</td>
                          <td className={`px-2 py-1 font-semibold ${color}`}>{result}</td>
                          <td className="px-2 py-1 text-right">{Number(t.takePts || 0)}</td>
                          <td className="px-2 py-1 text-right">{Number(t.tokens || 0)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
        <div className="flex justify-end gap-2">
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


