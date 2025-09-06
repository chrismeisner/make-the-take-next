import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getToken } from 'next-auth/jwt';
import { createRepositories } from '../../../lib/dal/factory';
import { useModal } from '../../../contexts/ModalContext';

export default function TeamsAdmin({ initialTeams = [], prefetched = false }) {
  const { openModal } = useModal();
  const [teams, setTeams] = useState(initialTeams);
  const [loading, setLoading] = useState(!prefetched);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (prefetched) return;
    (async () => {
      try {
        const res = await fetch('/api/admin/teams');
        const data = await res.json();
        if (!data.success) throw new Error(data.error || 'Failed to load teams');
        setTeams(data.teams || []);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [prefetched]);

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Teams Admin</h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => openModal('fetchTeams', { onFetched: async () => {
              try {
                // Trigger fetch on server with logging, then reload list
                await fetch('/api/admin/teams', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'fetch', league: 'nfl' }) });
                const res = await fetch('/api/admin/teams');
                const data = await res.json();
                if (data.success) setTeams(data.teams);
              } catch {}
            } })}
            className="px-3 py-2 bg-emerald-600 text-white rounded hover:bg-emerald-700"
          >
            Fetch Teams
          </button>
          <Link href="/admin/teams/new" className="px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">New Team</Link>
        </div>
      </div>
      {loading && <p>Loading…</p>}
      {error && <p className="text-red-600">{error}</p>}
      {!loading && !error && (
        <div className="overflow-x-auto border rounded">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-3 py-2">League</th>
                <th className="text-left px-3 py-2">Name</th>
                <th className="text-left px-3 py-2">Slug</th>
                <th className="text-left px-3 py-2">Logo</th>
                <th className="text-left px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {teams.map((t) => (
                <tr key={`${t.recordId}-${t.teamID}`} className="border-t">
                  <td className="px-3 py-2">{t.teamLeague}</td>
                  <td className="px-3 py-2">{t.teamNameFull || t.teamName}</td>
                  <td className="px-3 py-2">{t.teamAbbreviation}</td>
                  <td className="px-3 py-2">
                    {t.teamLogoURL ? (
                      <img src={t.teamLogoURL} alt={t.teamNameFull || t.teamName} className="w-8 h-8 object-contain" />
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <Link href={`/admin/teams/${encodeURIComponent(t.teamID)}/edit`} className="text-blue-600 hover:underline">Edit</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export async function getServerSideProps(ctx) {
  const token = await getToken({ req: ctx.req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) {
    return {
      redirect: {
        destination: `/login?next=${encodeURIComponent('/admin/teams')}`,
        permanent: false,
      },
    };
  }

  try {
    const { teams } = createRepositories();
    const list = await teams.listAll();
    return { props: { initialTeams: list, prefetched: true } };
  } catch (e) {
    return { props: { initialTeams: [], prefetched: true } };
  }
}

