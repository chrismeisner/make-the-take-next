import { useSession } from 'next-auth/react';
import { useRouter } from 'next/router';
import { useState, useEffect } from 'react';
import Link from 'next/link';

export default function AdminEventDetail() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { eventId } = router.query;
  const [event, setEvent] = useState(null);
  const [propsList, setPropsList] = useState([]);
  const [loadingProps, setLoadingProps] = useState(false);
  

  useEffect(() => {
    if (status !== 'authenticated' || !eventId) return;
    const fetchEvent = async () => {
      try {
        const res = await fetch(`/api/admin/events/${eventId}`);
        const data = await res.json();
        if (data.success) setEvent(data.event);
        else console.error(data.error);
      } catch (err) {
        console.error('Error fetching event detail:', err);
      }
    };
    fetchEvent();
  }, [status, eventId]);

  // Fetch props for this event
  useEffect(() => {
    if (status !== 'authenticated' || !eventId) return;
    const fetchProps = async () => {
      setLoadingProps(true);
      try {
        const res = await fetch(`/api/admin/events/${eventId}/props`);
        const data = await res.json();
        if (data.success) setPropsList(data.props);
        else console.error(data.error);
      } catch (err) {
        console.error('Error fetching props:', err);
      }
      setLoadingProps(false);
    };
    fetchProps();
  }, [status, eventId]);

  if (status === 'loading') {
    return <div className="container mx-auto px-4 py-6">Loading...</div>;
  }
  if (!session) {
    return <div className="container mx-auto px-4 py-6">Not authorized</div>;
  }
  if (!event) {
    return <div className="container mx-auto px-4 py-6">No event found.</div>;
  }

  return (
    <div className="container mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold mb-4">Event Detail</h1>
      <dl className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
        <dt className="font-medium">ID</dt>
        <dd>{event.id}</dd>
        <dt className="font-medium">Title</dt>
        <dd>{event.eventTitle}</dd>
        <dt className="font-medium">Time</dt>
        <dd>{event.eventTime}</dd>
        <dt className="font-medium">League</dt>
        <dd>{event.eventLeague}</dd>
      </dl>

      <div className="mt-4">
        <Link href={`/admin/events/${eventId}/create-prop`}>
          <button className="px-2 py-1 text-green-600 hover:underline">
            New prop for this event
          </button>
        </Link>
      </div>

      <div className="mt-6">
        <h2 className="text-xl font-semibold mb-2">Props for this event</h2>
        {loadingProps ? (
          <p>Loading props...</p>
        ) : propsList.length ? (
          <table className="min-w-full divide-y divide-gray-200">
            <thead>
              <tr>
                <th className="px-2 py-1 text-left text-sm font-medium text-gray-700">Order</th>
                <th className="px-2 py-1 text-left text-sm font-medium text-gray-700">Short</th>
                <th className="px-2 py-1 text-left text-sm font-medium text-gray-700">Summary</th>
                <th className="px-2 py-1 text-left text-sm font-medium text-gray-700">Status</th>
                <th className="px-2 py-1 text-left text-sm font-medium text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {propsList.map((p) => (
                <tr key={p.airtableId}>
                  <td className="px-2 py-1 text-sm">{p.propOrder}</td>
                  <td className="px-2 py-1 text-sm">{p.propShort}</td>
                  <td className="px-2 py-1 text-sm">{p.propSummary}</td>
                  <td className="px-2 py-1 text-sm">{p.propStatus}</td>
                  <td className="px-2 py-1 text-sm">
                    <Link href={`/admin/props/${p.airtableId}`}>
                      <button className="px-2 py-1 text-blue-600 hover:underline">Edit</button>
                    </Link>
                    <Link href={`/admin/gradeProps?ids=${p.airtableId}`}>
                      <button className="ml-2 px-2 py-1 text-blue-600 hover:underline">Grade</button>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p>No props found for this event.</p>
        )}
      </div>
    </div>
  );
}