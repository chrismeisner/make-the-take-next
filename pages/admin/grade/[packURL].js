import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { useSession } from "next-auth/react";
import Link from "next/link";
import Toast from "../../../components/Toast";

export default function GradePackPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const { packURL } = router.query;

  const [espnGameID, setEspnGameID] = useState(null);
  const [eventLeague, setEventLeague] = useState(null);
  const [homeTeam, setHomeTeam] = useState(null);
  const [awayTeam, setAwayTeam] = useState(null);
  const [eventTime, setEventTime] = useState(null);
  const [scoresFetched, setScoresFetched] = useState(false);
  const [homeTeamScore, setHomeTeamScore] = useState(null);
  const [awayTeamScore, setAwayTeamScore] = useState(null);
  const [propsList, setPropsList] = useState([]);
  const [statuses, setStatuses] = useState({});
  const [results, setResults] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [toastMessage, setToastMessage] = useState("");

  // Derive team nicknames (last word of full name)
  const homeNick = homeTeam ? homeTeam.split(' ').slice(-1)[0] : '';
  const awayNick = awayTeam ? awayTeam.split(' ').slice(-1)[0] : '';

  useEffect(() => {
    if (!packURL) return;
    setLoading(true);
    fetch(`/api/packs/${packURL}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          const propsData = data.pack.props || [];
          setPropsList(propsData);
          const init = {};
          propsData.forEach((p) => { init[p.airtableId] = p.propStatus; });
          setStatuses(init);
          const initRes = {};
          propsData.forEach((p) => { initRes[p.airtableId] = p.propResult || ""; });
          setResults(initRes);
          setEspnGameID(data.pack.espnGameID || null);
          setEventLeague(data.pack.eventLeague || null);
          setHomeTeam(data.pack.homeTeam || null);
          setAwayTeam(data.pack.awayTeam || null);
          setHomeTeamScore(data.pack.homeTeamScore ?? null);
          setAwayTeamScore(data.pack.awayTeamScore ?? null);
          setEventTime(data.pack.eventTime || null);
        } else {
          console.error("Failed to load props:", data.error);
        }
      })
      .catch((err) => console.error("Error fetching props:", err))
      .finally(() => setLoading(false));
  }, [packURL]);

  useEffect(() => {
    if (!loading && !scoresFetched && espnGameID && eventLeague) {
      fetch("/api/admin/fetchMlbEvents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: eventTime ? eventTime.slice(0,10).replace(/-/g, "") : "" }),
      })
        .then((res) => res.json())
        .then(() => fetch(`/api/packs/${packURL}`))
        .then((res2) => res2.json())
        .then((data2) => {
          if (data2.success) {
            setHomeTeamScore(data2.pack.homeTeamScore ?? null);
            setAwayTeamScore(data2.pack.awayTeamScore ?? null);
          }
        })
        .catch((err) => console.error("Error fetching live scores:", err))
        .finally(() => setScoresFetched(true));
    }
  }, [loading, scoresFetched, espnGameID, eventLeague, packURL, eventTime]);

  const handleStatusChange = (id, value) => {
    setStatuses((prev) => ({ ...prev, [id]: value }));
  };
  const handleResultChange = (id, value) => {
    setResults((prev) => ({ ...prev, [id]: value }));
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
        body: JSON.stringify({ updates, packURL }),
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

  if (session === undefined) {
    return <div>Loading...</div>;
  }
  if (!session?.user) {
    return <div>Not logged in.</div>;
  }

  return (
    <div className="p-4">
      {toastMessage && <Toast message={toastMessage} onClose={() => setToastMessage("")} />}
      <h1 className="text-2xl font-bold mb-4">Grade Pack: {packURL}</h1>
      {homeTeam && awayTeam && homeTeamScore !== null && awayTeamScore !== null && eventLeague && espnGameID && (
        <div className="mb-4">
          <a
            href={`https://www.espn.com/${eventLeague}/boxscore/_/gameId/${espnGameID}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 underline"
          >
            {awayNick} ({awayTeamScore}) vs {homeNick} ({homeTeamScore})
          </a>
        </div>
      )}
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
                </div>
                <div className="flex space-x-2">
                  <button
                    onClick={() => handleStatusChange(prop.airtableId, 'gradedA')}
                    className={`px-3 py-1 rounded ${statuses[prop.airtableId] === 'gradedA' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
                  >
                    {prop.sideALabel}
                  </button>
                  <button
                    onClick={() => handleStatusChange(prop.airtableId, 'gradedB')}
                    className={`px-3 py-1 rounded ${statuses[prop.airtableId] === 'gradedB' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
                  >
                    {prop.sideBLabel}
                  </button>
                  <button
                    onClick={() => handleStatusChange(prop.airtableId, 'push')}
                    className={`px-3 py-1 rounded ${statuses[prop.airtableId] === 'push' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
                  >
                    Push
                  </button>
                </div>
              </div>
              <div>
                <input
                  type="text"
                  value={results[prop.airtableId] || ""}
                  onChange={(e) => handleResultChange(prop.airtableId, e.target.value)}
                  className="border rounded px-2 py-1 w-full"
                  placeholder="Result"
                />
              </div>
            </div>
          ))}
        </div>
      )}
      {saveError && <p className="text-red-600 mt-4">Error: {saveError}</p>}
      <button
        onClick={handleSave}
        disabled={saving}
        className="mt-6 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
      >
        {saving ? "Saving..." : "Save"}
      </button>
    </div>
  );
} 