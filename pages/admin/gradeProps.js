import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { useSession } from "next-auth/react";
import Link from "next/link";
import Toast from "../../components/Toast";

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
    setSaving(true);
    setSaveError(null);
    try {
      const updates = propsList.map((p) => ({
        airtableId: p.airtableId,
        propID: p.propID,
        propStatus: statuses[p.airtableId],
        propResult: results[p.airtableId],
      }));
      const res = await fetch("/api/admin/updatePropsStatus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates }),
      });
      const result = await res.json();
      if (!result.success) {
        setSaveError(result.error || "Save failed");
      } else {
        setToastMessage("Grades saved successfully!");
      }
    } catch (err) {
      setSaveError(err.message);
    } finally {
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
    </div>
  );
}
