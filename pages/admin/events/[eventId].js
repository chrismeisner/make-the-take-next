import { useSession } from 'next-auth/react';
import { useRouter } from 'next/router';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useModal } from '../../../contexts/ModalContext';

export default function AdminEventDetail() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { eventId } = router.query;
  const [event, setEvent] = useState(null);
  const [propsList, setPropsList] = useState([]);
  const [loadingProps, setLoadingProps] = useState(false);
  const [generating, setGenerating] = useState(false);
  const { openModal } = useModal();
  

  useEffect(() => {
    if (status !== 'authenticated' || !eventId) return;
    const fetchEvent = async () => {
      try {
        const res = await fetch(`/api/admin/events/${encodeURIComponent(eventId)}`);
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
        const res = await fetch(`/api/admin/events/${encodeURIComponent(eventId)}/props`);
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

      {/* External links */}
      <div className="mt-4 flex items-center gap-3">
        {event?.espnGameID && event?.eventLeague && (
          <a
            href={`https://www.espn.com/${event.eventLeague}/game/_/gameId/${event.espnGameID}`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-2 bg-gray-100 text-gray-800 rounded hover:bg-gray-200"
          >
            View on ESPN
          </a>
        )}
        <button
          className="px-3 py-2 bg-gray-100 text-gray-800 rounded hover:bg-gray-200"
          onClick={() => {
            try {
              const initialDate = event?.eventTime ? new Date(event.eventTime).toISOString().slice(0,10) : '';
              const initialLeague = event?.eventLeague || '';
              openModal('addEvent', {
                initialLeague,
                initialDate,
                allowMultiSelect: false,
                onEventSelected: async (ev) => {
                  const chosen = Array.isArray(ev) ? ev[0] : ev;
                  if (!chosen?.id) return;
                  try {
                    const body = {
                      sourceEventId: chosen.id,
                      // Update basic details to chosen
                      title: chosen.eventTitle,
                      league: chosen.eventLeague,
                      eventTime: chosen.eventTime
                    };
                    const r = await fetch(`/api/admin/events/${encodeURIComponent(event.id)}/relink`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(body)
                    });
                    const j = await r.json();
                    if (!r.ok || !j?.success) throw new Error(j?.error || 'Relink failed');
                    // Refresh event data
                    const r2 = await fetch(`/api/admin/events/${encodeURIComponent(event.id)}`);
                    const j2 = await r2.json();
                    if (j2?.success && j2?.event) setEvent(j2.event);
                  } catch (e) {
                    console.error('Relink error:', e);
                    alert(e.message || 'Failed to relink');
                  }
                }
              });
            } catch {}
          }}
        >
          Relink Event
        </button>
      </div>

      {/* Edit Event (cover url or file upload) */}
      <div className="mt-6 p-4 bg-white border rounded">
        <h2 className="text-lg font-semibold mb-2">Edit Event</h2>
        <EditEventForm event={event} onUpdated={(ev) => setEvent(ev)} />
        <div className="mt-4 flex items-center gap-3">
          <button
            className="px-3 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
            disabled={generating}
            onClick={async () => {
              if (!event?.id) return;
              setGenerating(true);
              try {
                const r = await fetch(`/api/admin/events/${encodeURIComponent(event.id)}/generateCover`, {
                  method: 'POST'
                });
                const j = await r.json();
                if (!r.ok || !j?.success) throw new Error(j?.error || 'Failed to generate');
                // Refresh event data to reflect new cover
                try {
                  const r2 = await fetch(`/api/admin/events/${encodeURIComponent(event.id)}`);
                  const j2 = await r2.json();
                  if (j2?.success && j2?.event) setEvent(j2.event);
                } catch {}
              } catch (e) {
                // eslint-disable-next-line no-console
                console.error('Generate cover failed:', e);
                alert(e.message || 'Failed to generate cover');
              } finally {
                setGenerating(false);
              }
            }}
          >
            {generating ? 'Generating…' : 'Generate Event Cover'}
          </button>
          {Array.isArray(event.eventCover) && event.eventCover[0]?.url && (
            <div className="flex items-center gap-2 text-sm text-gray-700">
              <span>Current cover:</span>
              <img src={event.eventCover[0].url} alt="Event Cover" className="h-12 w-12 object-cover rounded" />
            </div>
          )}
        </div>
      </div>

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

function EditEventForm({ event, onUpdated }) {
  const [coverUrl, setCoverUrl] = useState(() => {
    try {
      const fieldVal = event?.eventCover;
      if (Array.isArray(fieldVal) && fieldVal.length) {
        const first = fieldVal[0];
        return first?.url || '';
      }
      return '';
    } catch { return ''; }
  });
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const uploadAndGetUrl = async () => {
    if (!file) return null;
    const toBase64 = (f) => new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(f);
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.onerror = (err) => reject(err);
    });
    const fileData = await toBase64(file);
    const r = await fetch('/api/admin/uploadEventCover', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: file.name, fileData, eventId: event.id })
    });
    const j = await r.json();
    if (!r.ok || !j?.success) throw new Error(j?.error || 'Upload failed');
    return j.url;
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      let finalUrl = coverUrl;
      if (file) {
        finalUrl = await uploadAndGetUrl();
      }
      const r = await fetch(`/api/admin/events/${encodeURIComponent(event.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coverUrl: finalUrl || null })
      });
      const j = await r.json();
      if (!r.ok || !j?.success) throw new Error(j?.error || 'Failed to update');
      onUpdated && onUpdated(j.event);
      setFile(null);
      setPreview(null);
    } catch (e2) {
      setError(e2.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSave} className="space-y-3">
      <div>
        <label className="block text-sm font-medium text-gray-700">Cover URL</label>
        <input
          type="text"
          className="mt-1 block w-full border rounded px-2 py-1"
          value={coverUrl}
          onChange={(e) => setCoverUrl(e.target.value)}
          placeholder="https://..."
        />
        {coverUrl && (
          <img src={coverUrl} alt="Event Cover" className="mt-2 h-32 object-contain" />)
        }
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700">Or upload image</label>
        <input
          type="file"
          accept="image/*"
          className="mt-1 block w-full"
          onChange={(e) => {
            const f = e.target.files && e.target.files[0];
            setFile(f || null);
            setPreview(f ? URL.createObjectURL(f) : null);
          }}
        />
        {preview && (
          <img src={preview} alt="Preview" className="mt-2 h-32 object-contain" />
        )}
      </div>
      {error && <div className="text-sm text-red-600">{error}</div>}
      <button type="submit" disabled={saving} className="px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
        {saving ? 'Saving…' : 'Save Changes'}
      </button>
    </form>
  );
}