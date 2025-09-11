import { useSession } from 'next-auth/react';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { useModal } from '../../../contexts/ModalContext';

export default function AdminCreatePackPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { openModal } = useModal();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [packTitle, setPackTitle] = useState('');
  const [packURL, setPackURL] = useState('');
  const [packSummary, setPackSummary] = useState('');
  const [packPrize, setPackPrize] = useState('');
  const [packLeague, setPackLeague] = useState('');
  const [packCoverUrl, setPackCoverUrl] = useState('');
  const [coverPreviewUrl, setCoverPreviewUrl] = useState(null);
  const [coverUploading, setCoverUploading] = useState(false);
  const [packStatus, setPackStatus] = useState('active');
  const [statusOptions, setStatusOptions] = useState([]);
  const [leagues, setLeagues] = useState([]);
  const [propsList, setPropsList] = useState([]);
  const [packOpenTime, setPackOpenTime] = useState('');
  const [packCloseTime, setPackCloseTime] = useState('');
  const [packEventId, setPackEventId] = useState('');
  const [packEventIds, setPackEventIds] = useState([]);
  const [packEventTimeISO, setPackEventTimeISO] = useState('');
  const [eventInfoById, setEventInfoById] = useState({});

  // Load leagues
  useEffect(() => {
    fetch('/api/admin/eventLeagues')
      .then(res => res.json())
      .then(data => { if (data.success) setLeagues(data.leagues); })
      .catch(err => console.error(err));
  }, []);

  // Load status options from existing packs
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/packs');
        const data = await res.json();
        if (!data.success) throw new Error(data.error || 'Failed to load packs');
        const normalizeStatus = (s) => {
          const v = String(s || '').trim().toLowerCase();
          if (v === 'coming soon' || v === 'coming-soon' || v === 'coming up' || v === 'coming-up' || v === 'upcoming') return 'coming-soon';
          return v;
        };
        const statuses = Array.from(new Set((data.packs || []).map(p => normalizeStatus(p.packStatus)))).filter(Boolean);
        if (!statuses.includes('active')) statuses.unshift('active');
        if (!statuses.includes('draft')) statuses.unshift('draft');
        if (!statuses.includes('coming-soon')) statuses.push('coming-soon');
        setStatusOptions(Array.from(new Set(statuses)).sort());
      } catch (e) {
        console.error(e);
      }
    })();
  }, []);

  // Prefill linked events when arriving with ?eventId or ?eventIds in the URL
  const eventPrefillAppliedRef = useRef(false);
  useEffect(() => {
    if (!router?.isReady) return;
    if (eventPrefillAppliedRef.current) return;
    const q = router.query || {};
    const ids = (() => {
      try {
        let list = [];
        if (Array.isArray(q.eventIds)) list = q.eventIds;
        else if (typeof q.eventIds === 'string') list = q.eventIds.split(',').map(s => s.trim()).filter(Boolean);
        if (typeof q.eventId === 'string' && q.eventId.trim()) list = [q.eventId.trim(), ...list];
        return Array.from(new Set(list.filter(Boolean)));
      } catch { return []; }
    })();
    if (!ids.length) return;
    eventPrefillAppliedRef.current = true;
    setPackEventIds(prev => (prev && prev.length ? prev : ids));
    setPackEventId(prev => (prev ? prev : ids[0]));
    setEventInfoById(prev => {
      const next = { ...prev };
      ids.forEach(id => { if (!next[id]) next[id] = { eventTitle: id, eventTime: null }; });
      return next;
    });
  }, [router.isReady]);

  useEffect(() => {
    const loadEventTime = async () => {
      if (!packEventId) return;
      try {
        const evRes = await fetch(`/api/admin/events/${encodeURIComponent(packEventId)}`);
        const evJson = await evRes.json();
        if (evRes.ok && evJson.success && evJson.event?.eventTime) {
          setPackEventTimeISO(evJson.event.eventTime);
        }
      } catch {}
    };
    loadEventTime();
  }, [packEventId]);

  useEffect(() => {
    const ids = Array.from(new Set([...(packEventIds || []), packEventId].filter(Boolean)));
    const missing = ids.filter((id) => {
      const info = eventInfoById[id];
      if (!info) return true;
      // If we only have placeholder info (no time/league), fetch full details
      return !info.eventTime || !info.eventLeague;
    });
    if (missing.length === 0) return;
    let cancelled = false;
    (async () => {
      try {
        const results = await Promise.all(
          missing.map(async (id) => {
            try {
              const res = await fetch(`/api/admin/events/${encodeURIComponent(id)}`);
              const json = await res.json();
              if (res.ok && json.success && json.event) {
                const ev = json.event;
                let coverUrl = null;
                try {
                  const fieldVal = ev.eventCover;
                  if (Array.isArray(fieldVal) && fieldVal.length > 0) {
                    const first = fieldVal[0];
                    coverUrl = (first && typeof first === 'object') ? (first.url || first?.thumbnails?.large?.url || first?.thumbnails?.full?.url) : null;
                  }
                } catch {}
                return {
                  id,
                  title: ev.eventTitle || id,
                  time: ev.eventTime || null,
                  league: ev.eventLeague || null,
                  coverUrl: coverUrl || null,
                  homeTeamLogo: ev.homeTeamLogo || null,
                  awayTeamLogo: ev.awayTeamLogo || null,
                };
              }
            } catch {}
            return { id, title: id, time: null };
          })
        );
        if (!cancelled) {
          setEventInfoById((prev) => {
            const next = { ...prev };
            results.forEach(({ id, title, time, league, coverUrl, homeTeamLogo, awayTeamLogo }) => {
              next[id] = { eventTitle: title, eventTime: time, eventLeague: league, eventCoverUrl: coverUrl, homeTeamLogo, awayTeamLogo };
            });
            return next;
          });
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [packEventIds, packEventId]);

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

  const moveProp = (fromIndex, toIndex) => {
    setPropsList(pl => {
      const newList = [...pl];
      const [moved] = newList.splice(fromIndex, 1);
      newList.splice(toIndex, 0, moved);
      return newList;
    });
  };

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
      let evId = packEventId;
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
      const evRes = await fetch(`/api/admin/events/${encodeURIComponent(evId)}`);
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
      const payload = { packTitle, packURL };
      if (!packTitle || !packURL) {
        throw new Error('packTitle and packURL are required');
      }
      if (packSummary) payload.packSummary = packSummary;
      if (packPrize) payload.prize = packPrize;
      if (packLeague) payload.packLeague = packLeague.toLowerCase();
      if (packCoverUrl) payload.packCoverUrl = packCoverUrl;
      if (packStatus) payload.packStatus = packStatus;
      if (packOpenTime) payload.packOpenTime = new Date(packOpenTime).toISOString();
      if (packCloseTime) payload.packCloseTime = new Date(packCloseTime).toISOString();
      if (propsList.length) payload.props = propsList.map(p => p.airtableId);
      if (Array.isArray(packEventIds) && packEventIds.length > 0) {
        payload.events = packEventIds;
      } else if (packEventId) {
        payload.events = [packEventId];
      }

      const res = await fetch('/api/packs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to create pack');
      }

      // Update prop order mapping for each prop (best-effort)
      if (propsList.length > 0) {
        const pid = data.record?.id || null;
        if (pid) {
          await Promise.all(
            propsList.map((prop, index) =>
              fetch('/api/props', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ propId: prop.airtableId, packId: pid, propOrder: index }),
              }).then(r => r.json()).catch(() => null)
            )
          );
        }
      }

      const newId = data.record?.id;
      if (newId) {
        router.push(`/admin/packs/${encodeURIComponent(newId)}`);
      } else {
        router.push('/admin/packs');
      }
    } catch (err) {
      setError(err.message || 'Failed to create pack.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold mb-4">Create Pack</h1>
      {error && <p className="text-red-600 mb-4">{error}</p>}
      <form onSubmit={handleSubmit} className="space-y-4 max-w-4xl mx-auto">
        {/* Linked Events */}
        <div className="p-4 border rounded">
          <div className="flex items-center justify-between">
            <div>
              <label className="block text-sm font-medium text-gray-700">Linked Events</label>
              <div className="text-sm text-gray-800">
                <div className="font-medium">
                  Primary: {packEventId ? (eventInfoById[packEventId]?.eventTitle || packEventId) : '—'}
                </div>
                {packEventId && (
                  <div className="text-xs text-gray-600">
                    {(() => {
                      const info = eventInfoById[packEventId] || {};
                      const league = info.eventLeague ? String(info.eventLeague).toUpperCase() : null;
                      const t = info.eventTime ? new Date(info.eventTime).toLocaleString() : null;
                      return [league, t].filter(Boolean).join(' · ');
                    })()}
                  </div>
                )}
                {packEventIds.length > 1 && (
                  <div className="text-gray-600">
                    Additional:
                    <ul className="list-disc list-inside">
                      {packEventIds.filter(id => id !== packEventId).map((id) => (
                        <li key={id}>
                          <div className="flex flex-col">
                            <span className="text-sm">{eventInfoById[id]?.eventTitle || id}</span>
                            <span className="text-xs text-gray-500">
                              {(() => {
                                const info = eventInfoById[id] || {};
                                const league = info.eventLeague ? String(info.eventLeague).toUpperCase() : null;
                                const t = info.eventTime ? new Date(info.eventTime).toLocaleString() : null;
                                return [league, t].filter(Boolean).join(' · ');
                              })()}
                            </span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
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
                        setPackEventIds(prev => Array.from(new Set([...(prev || []), ...ids])));
                        if (!packEventId && ids.length) setPackEventId(ids[0]);
                        setEventInfoById(prev => {
                          const next = { ...prev };
                          ev.forEach(e => { if (e?.id) next[e.id] = { eventTitle: e.eventTitle || e.id, eventTime: null }; });
                          return next;
                        });
                      } else {
                        if (!ev || !ev.id) return;
                        setPackEventId(ev.id);
                        setPackEventIds(prev => Array.from(new Set([...(prev || []), ev.id])));
                        setEventInfoById(prev => ({ ...prev, [ev.id]: { eventTitle: ev.eventTitle || ev.id, eventTime: null } }));
                      }
                    } catch {}
                  },
                })}
              >
                Select Events
              </button>
              {(packEventId || packEventIds.length > 0) && (
                <button
                  type="button"
                  className="px-3 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300"
                  onClick={() => { setPackEventId(''); setPackEventIds([]); }}
                >
                  Clear
                </button>
              )}
            </div>
          </div>
          {packEventIds.length > 0 && (
            <div className="mt-2 text-sm text-gray-700">
              <ul className="list-disc list-inside">
                {packEventIds.filter(id => id !== packEventId).map((id) => (
                  <li key={id} className="flex items-center space-x-2">
                    <span>{eventInfoById[id]?.eventTitle || id}</span>
                    <button
                      type="button"
                      className="px-2 py-1 text-xs bg-gray-200 rounded"
                      onClick={() => setPackEventIds(prev => prev.filter(eid => eid !== id))}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {packEventId && (
          <div className="mt-3 p-3 border rounded bg-gray-50">
            <h3 className="text-sm font-semibold mb-2">Linked Event Details</h3>
            {(() => {
              const info = eventInfoById[packEventId] || {};
              const title = info.eventTitle || packEventId;
              const league = info.eventLeague ? String(info.eventLeague).toUpperCase() : null;
              const time = info.eventTime
                ? new Date(info.eventTime).toLocaleString(undefined, {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                    timeZoneName: 'short',
                  })
                : null;
              const cover = info.eventCoverUrl || null;
              const homeLogo = info.homeTeamLogo || null;
              const awayLogo = info.awayTeamLogo || null;
              return (
                <div className="flex items-start gap-3">
                  {cover ? (
                    <img src={cover} alt="event cover" className="h-16 w-16 object-cover rounded" />
                  ) : (
                    <div className="h-16 w-16 bg-gray-200 rounded flex items-center justify-center text-gray-500 text-xs">No Cover</div>
                  )}
                  <div className="flex-1">
                    <div className="text-base font-medium">{title}</div>
                    <div className="text-xs text-gray-600">{[league, time].filter(Boolean).join(' · ')}</div>
                    {(homeLogo || awayLogo) && (
                      <div className="mt-2 flex items-center gap-2">
                        {awayLogo && <img src={awayLogo} alt="away team" className="h-6 w-6 object-contain" />}
                        <span className="text-xs text-gray-500">vs</span>
                        {homeLogo && <img src={homeLogo} alt="home team" className="h-6 w-6 object-contain" />}
                      </div>
                    )}
                    <div className="mt-2 text-xs">
                      <a href={`/admin/events/${encodeURIComponent(packEventId)}`} className="text-blue-600 underline">View event</a>
                    </div>
                  </div>
                </div>
              );
            })()}
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
          <label className="block text-sm font-medium text-gray-700">Prize</label>
          <input
            type="text"
            value={packPrize}
            onChange={(e) => setPackPrize(e.target.value)}
            className="mt-1 px-3 py-2 border rounded w-full"
            placeholder="e.g., $100 Gift Card"
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
              disabled={!packEventTimeISO}
              onClick={() => {
                try {
                  const d = new Date(packEventTimeISO);
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
              disabled={!packEventTimeISO}
              onClick={() => {
                try {
                  const d = new Date(packEventTimeISO);
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
              disabled={!packEventTimeISO}
              onClick={() => {
                try {
                  const d = new Date(packEventTimeISO);
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
              disabled={!packEventTimeISO}
              onClick={() => {
                try {
                  const d = new Date(packEventTimeISO);
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
              disabled={!([packEventId, ...(packEventIds||[])].filter(Boolean).length)}
              onClick={async () => {
                try {
                  const ids = Array.from(new Set([packEventId, ...(packEventIds||[])].filter(Boolean)));
                  if (ids.length === 0) return;
                  const times = await Promise.all(ids.map(async (id) => {
                    try {
                      const res = await fetch(`/api/admin/events/${encodeURIComponent(id)}`);
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
              disabled={!([packEventId, ...(packEventIds||[])].filter(Boolean).length)}
              onClick={async () => {
                try {
                  const ids = Array.from(new Set([packEventId, ...(packEventIds||[])].filter(Boolean)));
                  if (ids.length === 0) return;
                  const times = await Promise.all(ids.map(async (id) => {
                    try {
                      const res = await fetch(`/api/admin/events/${encodeURIComponent(id)}`);
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

        <div className="mt-6">
          <h2 className="text-lg font-medium mb-2">Props in this Pack</h2>
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
                  <th className="px-4 py-2 border">Cover</th>
                  <th className="px-4 py-2 border">Order</th>
                  <th className="px-4 py-2 border">Reorder</th>
                  <th className="px-4 py-2 border">Actions</th>
                </tr>
              </thead>
              <tbody>
                {propsList.map((prop, idx) => (
                  <tr key={idx}>
                    <td className="px-4 py-2 border">{prop.propShort || prop.propID || prop.airtableId}</td>
                    <td className="px-4 py-2 border">{prop.eventTitle || '-'}</td>
                    <td className="px-4 py-2 border">{prop.eventTime ? new Date(prop.eventTime).toLocaleString() : '-'}</td>
                    <td className="px-4 py-2 border">
                      {prop.propCoverUrl ? (
                        <img src={prop.propCoverUrl} alt="prop cover" className="h-12 w-12 object-cover rounded" />
                      ) : (
                        <span className="text-gray-500">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2 border text-center">{idx + 1}</td>
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
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setPropsList(pl => pl.filter((_, i) => i !== idx))}
                          className="px-2 py-1 text-red-600"
                        >
                          Remove
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {propsList.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-2 text-center text-gray-500">No props</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Cover Image</label>
          <input
            type="file"
            accept="image/*"
            onChange={handleCoverChange}
            className="mt-1"
          />
          <div className="mt-2">
            <button
              type="button"
              onClick={handleUseEventCover}
              className="px-3 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300"
            >
              Use event cover
            </button>
          </div>
          {coverUploading && <p className="text-gray-600 mt-2">Uploading cover...</p>}
          {(coverPreviewUrl || packCoverUrl) && (
            <img src={coverPreviewUrl || packCoverUrl} alt="Cover preview" className="mt-2 h-32 object-contain" />
          )}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Status</label>
          <select
            value={packStatus}
            onChange={(e) => setPackStatus(e.target.value)}
            className="mt-1 px-3 py-2 border rounded w-full"
          >
            {statusOptions.map(status => {
              const label = status === 'coming-soon'
                ? 'Coming soon'
                : (status.charAt(0).toUpperCase() + status.slice(1));
              return (
                <option key={status} value={status}>{label}</option>
              );
            })}
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


