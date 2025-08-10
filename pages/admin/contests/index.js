import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";

// Admin Contests Index (v1 foundation):
// - Lists contests from /api/contests
// - Filter by status (Open, Coming Up, Closed, Graded, Draft)
// - Sort by status group then start/end time
// - Quick actions: View public page, Create New Contest
export default function AdminContestsIndexPage() {
  const { data: session, status } = useSession();
  const [contests, setContests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Filters
  const [showDraft, setShowDraft] = useState(true);
  const [showOpen, setShowOpen] = useState(true);
  const [showComingUp, setShowComingUp] = useState(true);
  const [showClosed, setShowClosed] = useState(true);
  const [showGraded, setShowGraded] = useState(true);

  // Sort
  const [sortKey, setSortKey] = useState("status"); // status | start | end
  const [sortDir, setSortDir] = useState("asc"); // asc | desc

  useEffect(() => {
    if (status !== "authenticated") return;
    const fetchContests = async () => {
      setLoading(true);
      setError("");
      try {
        const res = await fetch("/api/contests");
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || "Failed to load contests");
        setContests(Array.isArray(data.contests) ? data.contests : []);
      } catch (err) {
        setError(err.message || "Failed to load contests");
      } finally {
        setLoading(false);
      }
    };
    fetchContests();
  }, [status]);

  if (status === "loading") return <div className="p-4">Loading...</div>;
  if (!session?.user) return <div className="p-4">Not authorized</div>;

  function statusVisible(s) {
    const v = (s || "").toLowerCase();
    if (v === "draft") return showDraft;
    if (v === "open") return showOpen;
    if (v === "coming up") return showComingUp;
    if (v === "closed") return showClosed;
    if (v === "graded") return showGraded;
    return true;
  }

  function statusPriority(s) {
    const v = (s || "").toLowerCase();
    if (v === "open") return 1;
    if (v === "coming up") return 2;
    if (v === "closed") return 3;
    if (v === "graded") return 4;
    if (v === "draft") return 5;
    return 99;
  }

  const filtered = useMemo(() => contests.filter((c) => statusVisible(c.contestStatus)), [contests, showDraft, showOpen, showComingUp, showClosed, showGraded]);

  const sorted = useMemo(() => {
    const copy = [...filtered];
    copy.sort((a, b) => {
      if (sortKey === "status") {
        const diff = statusPriority(a.contestStatus) - statusPriority(b.contestStatus);
        return sortDir === "asc" ? diff : -diff;
      }
      if (sortKey === "start") {
        const aT = a.contestStartTime ? new Date(a.contestStartTime).getTime() : 0;
        const bT = b.contestStartTime ? new Date(b.contestStartTime).getTime() : 0;
        return sortDir === "asc" ? aT - bT : bT - aT;
      }
      if (sortKey === "end") {
        const aT = a.contestEndTime ? new Date(a.contestEndTime).getTime() : 0;
        const bT = b.contestEndTime ? new Date(b.contestEndTime).getTime() : 0;
        return sortDir === "asc" ? aT - bT : bT - aT;
      }
      return 0;
    });
    return copy;
  }, [filtered, sortKey, sortDir]);

  function toggleSort(key) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Admin: Contests</h1>
        <Link href="/admin/contests/new">
          <button className="px-3 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700">Create New Contest</button>
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div className="flex flex-wrap gap-3 items-center">
          <label className="inline-flex items-center gap-1 text-sm"><input type="checkbox" checked={showOpen} onChange={() => setShowOpen((v) => !v)} />Open</label>
          <label className="inline-flex items-center gap-1 text-sm"><input type="checkbox" checked={showComingUp} onChange={() => setShowComingUp((v) => !v)} />Coming Up</label>
          <label className="inline-flex items-center gap-1 text-sm"><input type="checkbox" checked={showClosed} onChange={() => setShowClosed((v) => !v)} />Closed</label>
          <label className="inline-flex items-center gap-1 text-sm"><input type="checkbox" checked={showGraded} onChange={() => setShowGraded((v) => !v)} />Graded</label>
          <label className="inline-flex items-center gap-1 text-sm"><input type="checkbox" checked={showDraft} onChange={() => setShowDraft((v) => !v)} />Draft</label>
        </div>
        <div className="flex flex-wrap gap-2 items-center justify-start md:justify-end text-sm">
          <span className="text-gray-600">Sort by:</span>
          <button className={`px-2 py-1 border rounded ${sortKey === "status" ? "bg-gray-100" : ""}`} onClick={() => toggleSort("status")}>Status {sortKey === "status" ? (sortDir === "asc" ? "↑" : "↓") : ""}</button>
          <button className={`px-2 py-1 border rounded ${sortKey === "start" ? "bg-gray-100" : ""}`} onClick={() => toggleSort("start")}>Start {sortKey === "start" ? (sortDir === "asc" ? "↑" : "↓") : ""}</button>
          <button className={`px-2 py-1 border rounded ${sortKey === "end" ? "bg-gray-100" : ""}`} onClick={() => toggleSort("end")}>End {sortKey === "end" ? (sortDir === "asc" ? "↑" : "↓") : ""}</button>
        </div>
      </div>

      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

      <div className="overflow-x-auto">
        <table className="min-w-full bg-white">
          <thead>
            <tr>
              <th className="px-3 py-2 border text-left">Title</th>
              <th className="px-3 py-2 border text-left">Status</th>
              <th className="px-3 py-2 border text-left">Start</th>
              <th className="px-3 py-2 border text-left">End</th>
              <th className="px-3 py-2 border text-left"># Packs</th>
              <th className="px-3 py-2 border text-left">Winner</th>
              <th className="px-3 py-2 border text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="px-3 py-2 border" colSpan={7}>Loading...</td></tr>
            ) : sorted.length === 0 ? (
              <tr><td className="px-3 py-2 border" colSpan={7}>No contests</td></tr>
            ) : (
              sorted.map((c) => {
                const publicHref = c.contestID ? `/contests/${c.contestID}` : null;
                const winnerName = c.contestWinner?.profileUsername;
                return (
                  <tr key={c.airtableId}>
                    <td className="px-3 py-2 border">{c.contestTitle || "Untitled Contest"}</td>
                    <td className="px-3 py-2 border">{c.contestStatus || ""}</td>
                    <td className="px-3 py-2 border">{c.contestStartTime ? new Date(c.contestStartTime).toLocaleString() : ""}</td>
                    <td className="px-3 py-2 border">{c.contestEndTime ? new Date(c.contestEndTime).toLocaleString() : ""}</td>
                    <td className="px-3 py-2 border">{typeof c.packCount === 'number' ? c.packCount : ''}</td>
                    <td className="px-3 py-2 border">{winnerName || ''}</td>
                    <td className="px-3 py-2 border text-sm">
                      <div className="flex items-center gap-3">
                        {publicHref ? (
                          <Link href={publicHref} className="text-blue-600 hover:underline">View</Link>
                        ) : (
                          <span className="text-gray-400">View</span>
                        )}
                        <Link
                          href={`/admin/contests/${c.contestID || c.airtableId}`}
                          className="text-indigo-600 hover:underline"
                        >
                          Edit
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}





