import { useSession } from 'next-auth/react';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';

export default function AdminPackDetail() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { packId } = router.query;
  const [pack, setPack] = useState(null);

  useEffect(() => {
    if (status !== 'authenticated' || !packId) return;
    const fetchPack = async () => {
      try {
        const res = await fetch(`/api/admin/packs/${encodeURIComponent(packId)}`);
        const data = await res.json();
        if (data.success) setPack(data.pack || null); else console.error(data.error);
      } catch (err) {
        console.error('Error fetching packs:', err);
      }
    };
    fetchPack();
  }, [status, packId]);

  if (status === 'loading') return <div className="container mx-auto px-4 py-6">Loading...</div>;
  if (!session) return <div className="container mx-auto px-4 py-6">Not authorized</div>;
  if (!pack) return <div className="container mx-auto px-4 py-6">Pack not found</div>;

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">{pack.packTitle}</h1>
        <div className="flex items-center gap-2">
          <button
            className="px-3 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
            onClick={() => router.push(`/admin/packs/${pack.airtableId}/create-prop`)}
          >
            Add Prop
          </button>
          <button
            className="px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            onClick={() => router.push(`/admin/packs/${pack.airtableId}/edit`)}
          >
            Edit
          </button>
        </div>
      </div>
      <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
        <div>
          <dt className="font-medium">ID</dt>
          <dd>{pack.airtableId}</dd>
        </div>
        <div>
          <dt className="font-medium">URL</dt>
          <dd>{pack.packURL}</dd>
        </div>
        <div>
          <dt className="font-medium">Status</dt>
          <dd>{pack.packStatus}</dd>
        </div>
        <div>
          <dt className="font-medium">Created At</dt>
          <dd>{new Date(pack.createdAt).toLocaleString()}</dd>
        </div>
        <div>
          <dt className="font-medium">Event</dt>
          <dd>{pack.eventTitle || '-'}</dd>
        </div>
        <div>
          <dt className="font-medium"># Props</dt>
          <dd>{pack.propsCount}</dd>
        </div>
        <div className="md:col-span-2">
          <dt className="font-medium">Summary</dt>
          <dd>{pack.packSummary}</dd>
        </div>
      </dl>
    </div>
  );
}