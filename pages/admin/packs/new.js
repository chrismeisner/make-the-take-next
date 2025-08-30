import { useSession } from 'next-auth/react';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { useModal } from '../../../contexts/ModalContext';

export default function AdminNewPackPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { openModal } = useModal();
  const { eventId } = router.query || {};
  // Linked Event state
  const [linkedEventId, setLinkedEventId] = useState('');
  const [linkedEventIds, setLinkedEventIds] = useState([]);
  const [linkedEventTitle, setLinkedEventTitle] = useState('');
  const [linkedEventTime, setLinkedEventTime] = useState('');
  const [linkedEventLoading, setLinkedEventLoading] = useState(false);
  const [packTitle, setPackTitle] = useState('');
  const [packURL, setPackURL] = useState('');
  const [packSummary, setPackSummary] = useState('');
  const [firstPlace, setFirstPlace] = useState('');
  const [propsList, setPropsList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [leagues, setLeagues] = useState([]);
  const [packLeague, setPackLeague] = useState('');
  const [packCoverUrl, setPackCoverUrl] = useState('');
  const [coverPreviewUrl, setCoverPreviewUrl] = useState(null);
  const [coverUploading, setCoverUploading] = useState(false);
  const [statusOptions, setStatusOptions] = useState([]);
  const [packStatus, setPackStatus] = useState('active');
  const [packOpenTime, setPackOpenTime] = useState('');
  const [packCloseTime, setPackCloseTime] = useState('');
  const [linkedEventTimeISO, setLinkedEventTimeISO] = useState('');
  // Pack Creator selection
  const [creators, setCreators] = useState([]);
  const [selectedCreator, setSelectedCreator] = useState('');
  // New: cover source selector
  const [coverSource, setCoverSource] = useState('custom'); // 'custom' | 'event'
  useEffect(() => {
    fetch('/api/admin/eventLeagues')
      .then(res => res.json())
      .then(data => { if (data.success) setLeagues(data.leagues); })
      .catch(err => console.error(err));
  }, []);
  useEffect(() => {
    fetch('/api/packs')
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          let opts = Array.from(new Set(data.packs.map(p => p.packStatus)));
          if (!opts.includes('active')) opts.unshift('active');
          setStatusOptions(opts.sort());
        }
      })
      .catch(err => console.error(err));
  }, []);
  // Preload linked event from query param
  useEffect(() => {
    const loadEventFromQuery = async () => {
      if (typeof eventId !== 'string' || !eventId.startsWith('rec')) return;
      try {
        setLinkedEventLoading(true);
        setLinkedEventId(eventId);
        setLinkedEventIds((prev) => Array.from(new Set([...prev, eventId])));
        const res = await fetch(`/api/admin/events/${eventId}`);
        const data = await res.json();
        if (res.ok && data.success && data.event) {
          setLinkedEventTitle(data.event.eventTitle || 'Event');
          if (data.event.eventTime) {
            setLinkedEventTimeISO(data.event.eventTime);
            setLinkedEventTime(new Date(data.event.eventTime).toLocaleString());
          } else {
            setLinkedEventTime('');
            setLinkedEventTimeISO('');
          }
        }
      } catch (e) {
        // ignore
      } finally {
        setLinkedEventLoading(false);
      }
    };
    loadEventFromQuery();
  }, [eventId]);
  // Load creator profiles (checkbox creator=true)
  useEffect(() => {
    fetch('/api/admin/creators')
      .then(res => res.json())
      .then(data => {
        if (data.success) setCreators(data.creators);
      })
      .catch(() => {});
  }, []);
  const handleCoverChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setCoverUploading(true);
    setCoverPreviewUrl(URL.createObjectURL(file));
    try {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onloadend = async () => {
        const base64data = reader.result.split(',')[1];
        const res = await fetch('/api/admin/uploadPackCover', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename: file.name, fileData: base64data }),
        });
        const data = await res.json();
        if (data.success) {
          setPackCoverUrl(data.url);
        } else {
          setError(data.error || 'Failed to upload cover.');
        }
        setCoverUploading(false);
      };
    } catch (err) {
      setError(err.message || 'Failed to upload cover.');
      setCoverUploading(false);
    }
  };
  // Helper to get first attachment URL from Airtable-like attachment arrays
  const getFirstAttachmentUrl = (fieldVal) => {
    try {
      if (Array.isArray(fieldVal) && fieldVal.length > 0) {
        for (const entry of fieldVal) {
          if (entry && typeof entry === 'object') {
            if (typeof entry.url === 'string' && entry.url.startsWith('http')) return entry.url;
            const thumbUrl = entry?.thumbnails?.large?.url || entry?.thumbnails?.full?.url;
            if (typeof thumbUrl === 'string' && thumbUrl.startsWith('http')) return thumbUrl;
          } else if (typeof entry === 'string' && entry.startsWith('http')) {
            return entry;
          }
        }
      }
    } catch {}
    return null;
  };
  const handleUseEventCover = async () => {
    try {
      // Prefer linked Event on the pack
      let evId = (typeof linkedEventId === 'string' && linkedEventId.startsWith('rec')) ? linkedEventId : null;
      if (!evId) {
        if (!propsList || propsList.length === 0) {
          setError('Link an event to this pack or select a prop to derive the event cover.');
          return;
        }
        const first = propsList[0];
        if (!first?.airtableId) return;
        const propRes = await fetch(`/api/admin/props/${first.airtableId}`);
        const propJson = await propRes.json();
        if (!propRes.ok || !propJson.success || !propJson.prop?.event?.airtableId) {
          setError('Could not resolve event for the selected prop.');
          return;
        }
        evId = propJson.prop.event.airtableId;
      }
      const evRes = await fetch(`/api/admin/events/${evId}`);
      const evJson = await evRes.json();
      if (!evRes.ok || !evJson.success || !evJson.event) {
        setError('Failed to load event details for cover.');
        return;
      }
      const url = getFirstAttachmentUrl(evJson.event.eventCover);
      if (url) {
        setPackCoverUrl(url);
        setCoverPreviewUrl(url);
        setError(null);
      } else {
        setError('Event has no cover image.');
      }
    } catch (e) {
      setError(e.message || 'Failed to use event cover.');
    }
  };
  // Auto-compute event cover when source is 'event': prefer linked Event, fallback to first prop's event
  useEffect(() => {
    const computeFromEvent = async () => {
      if (coverSource !== 'event') return;
      try {
        // First try: linked Event
        if (typeof linkedEventId === 'string' && linkedEventId.startsWith('rec')) {
          const evRes = await fetch(`/api/admin/events/${linkedEventId}`);
          const evJson = await evRes.json();
          if (evRes.ok && evJson.success && evJson.event) {
            const url = getFirstAttachmentUrl(evJson.event.eventCover);
            if (url) {
              setPackCoverUrl(url);
              setCoverPreviewUrl(url);
              return;
            }
          }
        }
        // Fallback: first selected prop's event
        if (!propsList || propsList.length === 0) return;
        const first = propsList[0];
        if (!first?.airtableId) return;
        const propRes = await fetch(`/api/admin/props/${first.airtableId}`);
        const propJson = await propRes.json();
        if (!propRes.ok || !propJson.success || !propJson.prop?.event?.airtableId) return;
        const evId = propJson.prop.event.airtableId;
        const evRes = await fetch(`/api/admin/events/${evId}`);
        const evJson = await evRes.json();
        if (!evRes.ok || !evJson.success || !evJson.event) return;
        const url = getFirstAttachmentUrl(evJson.event.eventCover);
        if (url) {
          setPackCoverUrl(url);
          setCoverPreviewUrl(url);
        }
      } catch (e) {
        // Swallow; user can still upload custom cover
      }
    };
    computeFromEvent();
  }, [coverSource, linkedEventId, propsList]);

  if (status === 'loading') {
    return <div className="container mx-auto px-4 py-6">Loading...</div>;
  }
  if (!session) {
    return <div className="container mx-auto px-4 py-6">Not authorized</div>;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      // Build payload including event link and props
      const payload = { packTitle, packURL };
      if (packSummary) payload.packSummary = packSummary;
      if (firstPlace) payload.firstPlace = firstPlace;
      if (packLeague) payload.packLeague = packLeague.toLowerCase();
      if (packCoverUrl) payload.packCoverUrl = packCoverUrl;
      if (packOpenTime) payload.packOpenTime = new Date(packOpenTime).toISOString();
      if (packCloseTime) payload.packCloseTime = new Date(packCloseTime).toISOString();
      if (packStatus) payload.packStatus = packStatus;
      if (selectedCreator) payload.packCreator = [selectedCreator];
      if (propsList.length) payload.props = propsList.map(p => p.airtableId);
      // If events selected, send array; else fallback to single
      if (Array.isArray(linkedEventIds) && linkedEventIds.length > 0) {
        payload.events = linkedEventIds;
      } else if (typeof linkedEventId === 'string' && linkedEventId.startsWith('rec')) {
        payload.eventId = linkedEventId;
      }
      const res = await fetch('/api/packs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        // Persist the chosen order onto each Prop via propOrder
        if (propsList.length > 0) {
          await Promise.all(
            propsList.map((prop, index) =>
              fetch('/api/props', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ propId: prop.airtableId, packId: data.record.id, propOrder: index }),
              }).then(r => r.json()).catch(() => null)
            )
          );
        }
        router.push(`/admin/packs/${data.record.id}`);
      } else {
        setError(data.error || 'Failed to create pack.');
      }
    } catch (err) {
      setError(err.message || 'Failed to create pack.');
    } finally {
      setLoading(false);
    }
  };

  // Helper to move a prop in the list
  const moveProp = (fromIndex, toIndex) => {
    setPropsList(pl => {
      const newList = [...pl];
      const [moved] = newList.splice(fromIndex, 1);
      newList.splice(toIndex, 0, moved);
      return newList;
    });
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold mb-4">Create New Pack</h1>
      {error && <p className="text-red-600 mb-4">{error}</p>}
      <form onSubmit={handleSubmit} className="space-y-4 max-w-4xl mx-auto">
        {/* Linked Event */}
        <div className="p-4 border rounded">
          <div className="flex items-center justify-between">
            <div>
              <label className="block text-sm font-medium text-gray-700">Linked Event</label>
              {linkedEventLoading ? (
                <p className="text-gray-600">Loading event…</p>
              ) : linkedEventId ? (
                <div className="text-sm text-gray-800">
                  <div className="font-medium">{linkedEventTitle || linkedEventId}</div>
                  {linkedEventTime && <div className="text-gray-600">{linkedEventTime}</div>}
                </div>
              ) : (
                <p className="text-gray-600 text-sm">No event linked.</p>
              )}
            </div>
            <div className="flex items-center space-x-2">
              <button
                type="button"
                className="px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                onClick={() => openModal('addEvent', {
                  allowMultiSelect: true,
                  onEventSelected: (ev) => {
                    try {
                      if (Array.isArray(ev)) {
                        const ids = ev.map(e => e.id).filter(Boolean);
                        setLinkedEventIds(prev => Array.from(new Set([...(prev || []), ...ids])));
                        if (!linkedEventId && ids.length) setLinkedEventId(ids[0]);
                        setLinkedEventTitle('Event');
                      } else {
                        if (!ev || !ev.id) return;
                        setLinkedEventId(ev.id);
                        setLinkedEventIds((prev) => Array.from(new Set([...prev, ev.id])));
                        setLinkedEventTitle(ev.eventTitle || 'Event');
                      }
                      setLinkedEventTime('');
                      setLinkedEventTimeISO('');
                      (async () => {
                        try {
                          const evRes = await fetch(`/api/admin/events/${ev.id}`);
                          const evJson = await evRes.json();
                          if (evRes.ok && evJson.success && evJson.event?.eventTime) {
                            setLinkedEventTimeISO(evJson.event.eventTime);
                          }
                        } catch {}
                      })();
                      if (coverSource === 'event') {
                        (async () => {
                          try {
                            const evRes = await fetch(`/api/admin/events/${ev.id}`);
                            const evJson = await evRes.json();
                            if (evRes.ok && evJson.success && evJson.event) {
                              const url = getFirstAttachmentUrl(evJson.event.eventCover);
                              if (url) {
                                setPackCoverUrl(url);
                                setCoverPreviewUrl(url);
                              }
                            }
                          } catch {}
                        })();
                      }
                    } catch {}
                  },
                })}
              >
                Select Events
              </button>
              {linkedEventId && (
                <button
                  type="button"
                  className="px-3 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300"
                  onClick={() => {
                    setLinkedEventId('');
                    setLinkedEventIds([]);
                    setLinkedEventTitle('');
                    setLinkedEventTime('');
                  }}
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        </div>
        {linkedEventIds.length > 0 && (
          <div className="mt-2 text-sm text-gray-700">
            <div>Linked events:</div>
            <ul className="list-disc list-inside">
              {linkedEventIds.filter(id => id !== linkedEventId).map((id) => (
                <li key={id} className="flex items-center space-x-2">
                  <span>{id}</span>
                  <button
                    type="button"
                    className="px-2 py-1 text-xs bg-gray-200 rounded"
                    onClick={() => setLinkedEventIds(prev => prev.filter(eid => eid !== id))}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div>
          <label className="block text-sm font-medium text-gray-700">Pack Title</label>
          <input
            type="text"
            value={packTitle}
            onChange={(e) => setPackTitle(e.target.value)}
            className="mt-1 px-3 py-2 border rounded w-full"
            required
          />
          <div className="mt-2">
            {/* Removed Generate from Event button */}
          </div>
        </div>
        {/* Pack Creator */}
        <div>
          <label className="block text-sm font-medium text-gray-700">Pack Creator</label>
          <select
            value={selectedCreator}
            onChange={(e) => setSelectedCreator(e.target.value)}
            className="mt-1 px-3 py-2 border rounded w-full"
          >
            <option value="">Select an influencer (optional)</option>
            {creators.map((c) => (
              <option key={c.airtableId} value={c.airtableId}>
                {c.profileID}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Pack URL</label>
          <input
            type="text"
            value={packURL}
            onChange={(e) => setPackURL(e.target.value)}
            className="mt-1 px-3 py-2 border rounded w-full"
            required
          />
          <div className="mt-2 flex space-x-2">
            <button
              type="button"
              onClick={() => {
                const baseSlug = packTitle
                  .toLowerCase()
                  .trim()
                  .replace(/[^a-z0-9]+/g, '-')
                  .replace(/^-+|-+$/g, '');
                const now = new Date();
                const YY = String(now.getFullYear() % 100).padStart(2, '0');
                const MM = String(now.getMonth() + 1).padStart(2, '0');
                const DD = String(now.getDate()).padStart(2, '0');
                const hh = String(now.getHours()).padStart(2, '0');
                const mm = String(now.getMinutes()).padStart(2, '0');
                const timestamp = `${YY}${MM}${DD}${hh}${mm}`;
                setPackURL(`${baseSlug}-${timestamp}`);
              }}
              disabled={!packTitle}
              className="px-3 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300 disabled:opacity-50"
            >
              Generate from Title
            </button>
            <button
              type="button"
              onClick={() => {
                const rand = Math.random().toString(36).substring(2,8);
                setPackURL(rand);
              }}
              className="px-3 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300"
            >
              Generate Random URL
            </button>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Summary</label>
          <textarea
            value={packSummary}
            onChange={(e) => setPackSummary(e.target.value)}
            className="mt-1 px-3 py-2 border rounded w-full"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">First Place</label>
          <input
            type="text"
            value={firstPlace}
            onChange={(e) => setFirstPlace(e.target.value)}
            className="mt-1 px-3 py-2 border rounded w-full"
            placeholder="e.g., $1,000 or Prize description"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Open Time</label>
          <input
            type="datetime-local"
            value={packOpenTime}
            onChange={(e) => setPackOpenTime(e.target.value)}
            className="mt-1 px-3 py-2 border rounded w-full"
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              className="px-3 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300 disabled:opacity-50"
              disabled={!linkedEventTimeISO}
              onClick={() => {
                try {
                  const d = new Date(linkedEventTimeISO);
                  const pad = (n) => String(n).padStart(2, '0');
                  const local = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
                  setPackOpenTime(local);
                } catch {}
              }}
            >
              Event time
            </button>
            <button
              type="button"
              className="px-3 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300 disabled:opacity-50"
              disabled={!linkedEventTimeISO}
              onClick={() => {
                try {
                  const d = new Date(linkedEventTimeISO);
                  const dt = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 13, 0, 0);
                  const pad = (n) => String(n).padStart(2, '0');
                  const local = `${dt.getFullYear()}-${pad(dt.getMonth()+1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
                  setPackOpenTime(local);
                } catch {}
              }}
            >
              1pm event day
            </button>
            <button
              type="button"
              className="px-3 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300 disabled:opacity-50"
              disabled={!linkedEventTimeISO}
              onClick={() => {
                try {
                  const d = new Date(linkedEventTimeISO);
                  const dt = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 16, 0, 0);
                  const pad = (n) => String(n).padStart(2, '0');
                  const local = `${dt.getFullYear()}-${pad(dt.getMonth()+1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
                  setPackOpenTime(local);
                } catch {}
              }}
            >
              4pm event day
            </button>
            <button
              type="button"
              className="px-3 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300 disabled:opacity-50"
              disabled={!linkedEventTimeISO}
              onClick={() => {
                try {
                  const d = new Date(linkedEventTimeISO);
                  const dt = new Date(d.getTime() - 3 * 60 * 60 * 1000);
                  const pad = (n) => String(n).padStart(2, '0');
                  const local = `${dt.getFullYear()}-${pad(dt.getMonth()+1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
                  setPackOpenTime(local);
                } catch {}
              }}
            >
              3 hours before event
            </button>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Close Time (optional)</label>
          <input
            type="datetime-local"
            value={packCloseTime}
            onChange={(e) => setPackCloseTime(e.target.value)}
            className="mt-1 px-3 py-2 border rounded w-full"
          />
          <div className="mt-2">
            <button
              type="button"
              className="px-3 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300 disabled:opacity-50"
              disabled={!([linkedEventId, ...(linkedEventIds||[])].filter(Boolean).length)}
              onClick={async () => {
                try {
                  const ids = Array.from(new Set([linkedEventId, ...(linkedEventIds||[])].filter(Boolean)));
                  if (ids.length === 0) return;
                  const times = await Promise.all(ids.map(async (id) => {
                    try {
                      const res = await fetch(`/api/admin/events/${id}`);
                      const json = await res.json();
                      return res.ok && json.success && json.event?.eventTime ? new Date(json.event.eventTime).getTime() : NaN;
                    } catch { return NaN; }
                  }));
                  const valid = times.filter((t) => Number.isFinite(t));
                  if (valid.length === 0) return;
                  const earliest = Math.min(...valid);
                  const d = new Date(earliest);
                  const pad = (n) => String(n).padStart(2, '0');
                  const local = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
                  setPackCloseTime(local);
                } catch {}
              }}
            >
              Earliest event start time
            </button>
            <button
              type="button"
              className="ml-2 px-3 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300 disabled:opacity-50"
              disabled={!([linkedEventId, ...(linkedEventIds||[])].filter(Boolean).length)}
              onClick={async () => {
                try {
                  const ids = Array.from(new Set([linkedEventId, ...(linkedEventIds||[])].filter(Boolean)));
                  if (ids.length === 0) return;
                  const times = await Promise.all(ids.map(async (id) => {
                    try {
                      const res = await fetch(`/api/admin/events/${id}`);
                      const json = await res.json();
                      return res.ok && json.success && json.event?.eventTime ? new Date(json.event.eventTime).getTime() : NaN;
                    } catch { return NaN; }
                  }));
                  const valid = times.filter((t) => Number.isFinite(t));
                  if (valid.length === 0) return;
                  const latest = Math.max(...valid);
                  const d = new Date(latest);
                  const pad = (n) => String(n).padStart(2, '0');
                  const local = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
                  setPackCloseTime(local);
                } catch {}
              }}
            >
              Latest event start time
            </button>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">League</label>
          <select
            value={packLeague}
            onChange={(e) => setPackLeague(e.target.value)}
            className="mt-1 px-3 py-2 border rounded w-full"
          >
            <option value="">Select a league</option>
            {leagues.map((lg) => (
              <option key={lg} value={lg}>{lg}</option>
            ))}
          </select>
        </div>
        {/* Removed Event selection section */}
        {/* Props section */}
        <div className="mt-6">
          <h2 className="text-lg font-medium mb-2">Props to Add</h2>
          <div className="mb-2">
            <button
              type="button"
              onClick={() => openModal('addProp', { onPropsAdded: selectedProps => setPropsList(pl => [...pl, ...selectedProps]), initialLeague: packLeague, excludeIds: propsList.map(p => p.airtableId).filter(Boolean), viewName: 'Open' })}
              className="px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Add Prop
            </button>
          </div>
          <div className="overflow-x-auto mb-4">
            <table className="min-w-full bg-white">
            <thead>
              <tr>
                <th className="px-4 py-2 border">Prop Short</th>
                <th className="px-4 py-2 border">Event</th>
                <th className="px-4 py-2 border">Event Time</th>
                <th className="px-4 py-2 border">Order</th>
                <th className="px-4 py-2 border">Actions</th>
              </tr>
            </thead>
            <tbody>
              {propsList.map((prop, idx) => (
                <tr key={idx}>
                  <td className="px-4 py-2 border">{prop.propShort || prop.propID || prop.airtableId}</td>
                  <td className="px-4 py-2 border">{prop.eventTitle || '-'}</td>
                  <td className="px-4 py-2 border">{prop.eventTime ? new Date(prop.eventTime).toLocaleString() : '-'}</td>
                  <td className="px-4 py-2 border whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => idx > 0 && moveProp(idx, idx - 1)}
                      className="px-2 py-1 mr-1 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50"
                      disabled={idx === 0}
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      onClick={() => idx < propsList.length - 1 && moveProp(idx, idx + 1)}
                      className="px-2 py-1 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50"
                      disabled={idx === propsList.length - 1}
                    >
                      ▼
                    </button>
                  </td>
                  <td className="px-4 py-2 border">
                    <button
                      type="button"
                      onClick={() => setPropsList(pl => pl.filter((_, i) => i !== idx))}
                      className="px-2 py-1 text-red-600"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
              {propsList.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-2 text-center text-gray-500">No props added</td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
        </div>
        {/* Cover Image upload */}
        <div>
          <label className="block text-sm font-medium text-gray-700">Cover Source</label>
          <select
            value={coverSource}
            onChange={(e) => {
              const v = e.target.value;
              setCoverSource(v);
              if (v !== 'custom') {
                // Clear any staged custom file preview; we'll use event cover instead
                setCoverPreviewUrl(null);
              }
            }}
            className="mt-1 px-3 py-2 border rounded w-full"
          >
            <option value="custom">Custom Upload</option>
            <option value="event">Event cover (from first prop's event)</option>
          </select>
        </div>
        {coverSource === 'custom' && (
          <div>
            <label className="block text-sm font-medium text-gray-700">Cover Image</label>
            <input
              type="file"
              accept="image/*"
              onChange={handleCoverChange}
              className="mt-1"
            />
            {coverUploading && <p className="text-gray-600 mt-2">Uploading cover...</p>}
            <div className="mt-2">
              <button
                type="button"
                onClick={handleUseEventCover}
                className="px-3 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300"
              >
                Use event cover
              </button>
            </div>
          </div>
        )}
        {coverSource === 'event' && (
          <div className="text-sm text-gray-600">
            {propsList.length === 0 ? (
              <p>Select at least one prop to derive the event cover.</p>
            ) : (
              <p>Using the event cover from the first selected prop's event.</p>
            )}
          </div>
        )}
        {(coverPreviewUrl || packCoverUrl) && (
          <img src={coverPreviewUrl || packCoverUrl} alt="Cover preview" className="mt-2 h-32 object-contain" />
        )}
        <div>
          <label className="block text-sm font-medium text-gray-700">Status</label>
          <select
            value={packStatus}
            onChange={(e) => setPackStatus(e.target.value)}
            className="mt-1 px-3 py-2 border rounded w-full"
          >
            {statusOptions.map(status => (
              <option key={status} value={status}>
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </option>
            ))}
          </select>
        </div>
        <div className="flex space-x-2">
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Creating...' : 'Create Pack'}
          </button>
          <Link href="/admin/packs">
            <button
              type="button"
              className="px-4 py-2 bg-gray-300 text-gray-800 rounded hover:bg-gray-400"
            >
              Cancel
            </button>
          </Link>
        </div>
      </form>
    </div>
  );
}