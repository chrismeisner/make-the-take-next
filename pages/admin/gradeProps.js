import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { useSession } from "next-auth/react";
import Link from "next/link";
import Toast from "../../components/Toast";
import GlobalModal from "../../components/modals/GlobalModal";

export default function GradePropsPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const idsParam = typeof router.query.ids === 'string' ? router.query.ids : '';
  const propIDs = useMemo(() => idsParam ? idsParam.split(',').filter(Boolean) : [], [idsParam]);

  const [propsList, setPropsList] = useState([]);
  const [statuses, setStatuses] = useState({});
  const [results, setResults] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [toastMessage, setToastMessage] = useState("");
  const [resultLog, setResultLog] = useState(null);
  const [showResultModal, setShowResultModal] = useState(false);

  useEffect(() => {
    if (propIDs.length === 0) return;
    setLoading(true);
    fetch("/api/admin/getPropsByIDs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ propIDs }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          const list = data.props || [];
          setPropsList(list);
          const initSt = {};
          const initRes = {};
          list.forEach((p) => {
            initSt[p.airtableId] = p.propStatus;
            initRes[p.airtableId] = p.propResult || "";
          });
          setStatuses(initSt);
          setResults(initRes);
        } else {
          setSaveError(data.error || "Failed to load props");
        }
      })
      .catch((err) => setSaveError(err.message))
      .finally(() => setLoading(false));
  }, [propIDs]);

  const handleStatusChange = (airtableId, value) => {
    setStatuses((prev) => ({ ...prev, [airtableId]: value }));
  };
  const handleResultChange = (airtableId, value) => {
    setResults((prev) => ({ ...prev, [airtableId]: value }));
  };

  const handleSave = async () => {
    console.log("📝 [GradeProps] Save clicked. Preparing updates...");
    setSaving(true);
    setSaveError(null);
    try {
      const updates = propsList.map((p) => ({
        airtableId: p.airtableId,
        propID: p.propID,
        packID: p.packID,
        propStatus: statuses[p.airtableId],
        propResult: results[p.airtableId],
      }));
      console.log("📦 [GradeProps] Updates payload constructed:", {
        count: updates.length,
        updates: updates.map(u => ({ airtableId: u.airtableId, propID: u.propID, packID: u.packID, propStatus: u.propStatus, propResult: u.propResult }))
      });
      console.log("🚀 [GradeProps] Sending POST → /api/admin/updatePropsStatus");
      const res = await fetch("/api/admin/updatePropsStatus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates }),
      });
      const result = await res.json();
      console.log("📥 [GradeProps] Response received from server:", result);
      if (!result.success) {
        console.error("❌ [GradeProps] Save failed:", result.error);
        setSaveError(result.error || "Save failed");
      } else {
        setToastMessage("Grades saved successfully!");
        // Show result log modal with details: updated props, packs processed, and SMS results
        setResultLog({
          smsCount: result.smsCount || 0,
          updatedProps: result.details?.updatedProps || [],
          propToPacks: result.details?.propToPacks || [],
          packsProcessed: result.details?.packsProcessed || [],
        });
        // Log notable details for visibility
        const achievements = result.details?.achievementsCreated || [];
        const updatedCount = (result.details?.updatedProps || []).length;
        const packsCount = (result.details?.packsProcessed || []).length;
        console.log("✅ [GradeProps] Save succeeded:", {
          updatedPropsCount: updatedCount,
          packsProcessedCount: packsCount,
          smsCount: result.smsCount || 0,
          achievementsCreatedCount: achievements.length,
          achievementsCreated: achievements,
        });
        setShowResultModal(true);
      }
    } catch (err) {
      console.error("💥 [GradeProps] Network/Unexpected error during save:", err);
      setSaveError(err.message);
    } finally {
      console.log("🏁 [GradeProps] Save flow finished.");
      setSaving(false);
    }
  };

  if (!session?.user) {
    return <div>Not logged in.</div>;
  }

  return (
    <div className="space-y-4">
      {toastMessage && <Toast message={toastMessage} onClose={() => setToastMessage("")} />}
      <h1 className="text-2xl font-bold mb-4">Grade Props</h1>
      <Link href="/admin">
        <button className="text-blue-600 underline mb-4 inline-block">&larr; Back to Admin</button>
      </Link>
      {loading ? (
        <p>Loading props...</p>
      ) : (
        <div className="space-y-4">
          {propsList.map((prop) => (
            <div key={prop.airtableId} className="space-y-2">
              <div className="flex items-center space-x-4">
                <div className="flex-1">
                  <div className="font-medium">{prop.propShort}</div>
                  <div className="text-sm text-gray-600">{prop.propSummary}</div>
                  {prop.packInfo && (
                    <div className="text-sm text-gray-700 mt-2">
                      In Pack:{' '}
                      <Link href={`/packs/${prop.packInfo.packURL}`}>
                        <span className="text-blue-600 underline">{prop.packInfo.packTitle || prop.packInfo.packURL || prop.packInfo.packID}</span>
                      </Link>
                    </div>
                  )}
                  {prop.propLeagueLookup && prop.propESPNLookup && (
                    <a
                      href={`https://www.espn.com/${String(prop.propLeagueLookup).toLowerCase()}/boxscore/_/gameId/${prop.propESPNLookup}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 underline text-sm mt-1 block"
                    >
                      View Game
                    </a>
                  )}
                </div>
                <div className="flex space-x-2">
                  {prop.sideLabels.map((label, i) => {
                    const letter = String.fromCharCode(65 + i);
                    const statusKey = `graded${letter}`;
                    return (
                      <button
                        key={letter}
                        onClick={() => handleStatusChange(prop.airtableId, statusKey)}
                        className={`px-3 py-1 rounded ${
                          statuses[prop.airtableId] === statusKey ? "bg-green-600 text-white" : "bg-gray-200"
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                  <button
                    onClick={() => handleStatusChange(prop.airtableId, 'push')}
                    className={`px-3 py-1 rounded ml-2 ${
                      statuses[prop.airtableId] === 'push' ? 'bg-yellow-600 text-white' : 'bg-gray-200'
                    }`}
                  >
                    Push
                  </button>
                </div>
                <div className="mt-2">
                  <input
                    type="text"
                    placeholder="Result"
                    value={results[prop.airtableId] || ''}
                    onChange={(e) => handleResultChange(prop.airtableId, e.target.value)}
                    className="w-full border px-2 py-1 rounded"
                  />
                </div>
              </div>
            </div>
          ))}
          <div className="mt-4">
            <button
              disabled={saving}
              onClick={handleSave}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
            {saveError && <p className="text-red-600 mt-2">{saveError}</p>}
          </div>
        </div>
      )}

      {showResultModal && (
        <GlobalModal isOpen={showResultModal} onClose={() => setShowResultModal(false)} className="max-w-4xl">
          <h2 className="text-xl font-bold mb-3">Grading Results</h2>
          {resultLog ? (
            <div className="space-y-4">
              <div className="p-3 bg-gray-50 rounded border">
                <p className="font-medium">Updated Props</p>
                <ul className="list-disc list-inside text-sm mt-2">
                  {resultLog.updatedProps.map((p) => (
                    <li key={p.airtableId}>
                      {p.propID || p.airtableId} — status: <span className="font-mono">{p.propStatus}</span>{p.propResult ? `, result: ${p.propResult}` : ''}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="p-3 bg-gray-50 rounded border">
                <p className="font-medium">Props and Their Packs</p>
                {resultLog.propToPacks.length === 0 ? (
                  <p className="text-sm text-gray-600 mt-2">No related packs found for these props.</p>
                ) : (
                  <ul className="list-disc list-inside text-sm mt-2">
                    {resultLog.propToPacks.map((entry) => (
                      <li key={entry.airtableId}>
                        {entry.propID || entry.airtableId} → {entry.packs.map(pk => pk.packTitle || pk.packURL || pk.airtableId).join(', ')}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="p-3 bg-gray-50 rounded border">
                <p className="font-medium">Pack Result SMS</p>
                {resultLog.packsProcessed.length === 0 ? (
                  <p className="text-sm text-gray-600 mt-2">No packs graded by this save.</p>
                ) : (
                  <ul className="list-disc list-inside text-sm mt-2">
                    {resultLog.packsProcessed.map((pk) => (
                      <li key={pk.airtableId}>
                        SMS results for Pack {pk.packTitle || pk.packURL || pk.airtableId}: sent to {pk.smsSentCount} user{pk.smsSentCount === 1 ? '' : 's'}
                      </li>
                    ))}
                  </ul>
                )}
                <p className="text-sm text-gray-700 mt-2">Total SMS sent: <span className="font-semibold">{resultLog.smsCount}</span></p>
              </div>
              <div className="flex justify-end gap-2">
                <Link href="/admin">
                  <button className="px-4 py-2 bg-gray-600 text-white rounded">Back to Admin</button>
                </Link>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-600">No results to display.</p>
          )}
        </GlobalModal>
      )}
    </div>
  );
}

