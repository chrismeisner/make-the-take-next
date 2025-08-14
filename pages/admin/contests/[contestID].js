import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { useSession } from "next-auth/react";

export default function AdminContestDetailPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { contestID } = router.query;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [contest, setContest] = useState(null);

  useEffect(() => {
    if (status !== "authenticated") return;
    if (!contestID) return;
    let active = true;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const res = await fetch(`/api/contests/${contestID}`);
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || "Failed to fetch contest");
        if (active) setContest(data.contest);
      } catch (err) {
        if (active) setError(err.message || "Failed to fetch contest");
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [status, contestID]);

  if (status === "loading") return <div className="p-4">Loading...</div>;
  if (!session?.user) return <div className="p-4">Not authorized</div>;

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold">Admin: Contest Detail</h1>
          <p className="text-sm text-gray-600">Contest ID: {contestID}</p>
        </div>
        <Link href="/admin/contests" className="text-blue-600 hover:underline">Back to Contests</Link>
      </div>

      {loading ? (
        <div>Loading...</div>
      ) : error ? (
        <div className="text-red-600">Error: {error}</div>
      ) : !contest ? (
        <div>Not found</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <section className="lg:col-span-2 border rounded p-4">
            <h2 className="text-lg font-semibold mb-3">Basics</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-sm text-gray-600 mb-1">Title</label>
                <input
                  type="text"
                  value={contest.contestTitle || ""}
                  readOnly
                  className="w-full px-3 py-2 border rounded bg-gray-50"
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Status</label>
                  <input
                    type="text"
                    value={contest.contestStatus || ""}
                    readOnly
                    className="w-full px-3 py-2 border rounded bg-gray-50"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Pack Count</label>
                  <input
                    type="text"
                    value={typeof contest.packCount === 'number' ? contest.packCount : (Array.isArray(contest.packs) ? contest.packs.length : '')}
                    readOnly
                    className="w-full px-3 py-2 border rounded bg-gray-50"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Start</label>
                  <input
                    type="text"
                    value={contest.contestStartTime ? new Date(contest.contestStartTime).toLocaleString() : ''}
                    readOnly
                    className="w-full px-3 py-2 border rounded bg-gray-50"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">End</label>
                  <input
                    type="text"
                    value={contest.contestEndTime ? new Date(contest.contestEndTime).toLocaleString() : ''}
                    readOnly
                    className="w-full px-3 py-2 border rounded bg-gray-50"
                  />
                </div>
              </div>
            </div>
          </section>

          <section className="border rounded p-4">
            <h2 className="text-lg font-semibold mb-3">Actions</h2>
            <div className="space-y-2 text-sm">
              <p className="text-gray-600">Edit actions coming next.</p>
              {contest.contestID && (
                <Link href={`/contests/${contest.contestID}`} className="text-blue-600 hover:underline">View Public Page</Link>
              )}
            </div>
          </section>

          <section className="lg:col-span-3 border rounded p-4">
            <h2 className="text-lg font-semibold mb-3">Packs</h2>
            {Array.isArray(contest.packs) && contest.packs.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="px-3 py-2 text-left">Title</th>
                      <th className="px-3 py-2 text-left">URL</th>
                      <th className="px-3 py-2 text-left">Props</th>
                    </tr>
                  </thead>
                  <tbody>
                    {contest.packs.map((p) => (
                      <tr key={p.airtableId} className="border-t">
                        <td className="px-3 py-2">{p.packTitle}</td>
                        <td className="px-3 py-2">{p.packURL}</td>
                        <td className="px-3 py-2">{p.propsCount ?? '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-gray-600">No packs in this contest.</p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}



