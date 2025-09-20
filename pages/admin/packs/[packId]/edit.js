import { useSession } from 'next-auth/react';
import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { useModal } from '../../../../contexts/ModalContext';

export default function AdminEditPackPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { openModal } = useModal();
  const { packId } = router.query;

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
  // AI summary helpers
  const [aiContext, setAiContext] = useState('');
  const [aiModel, setAiModel] = useState('');
  const [generatingSummary, setGeneratingSummary] = useState(false);

  // Load leagues
  useEffect(() => {
    fetch('/api/admin/eventLeagues')
      .then(res => res.json())
      .then(data => { if (data.success) setLeagues(data.leagues); })
      .catch(err => console.error(err));
  }, []);

  // Load pack base info and status options
  useEffect(() => {
    if (status !== 'authenticated' || !packId) return;
    (async () => {
      try {
        const res = await fetch(`/api/admin/packs/${encodeURIComponent(packId)}`);
        const data = await res.json();
        if (!res.ok || !data.success || !data.pack) {
          setError('Pack not found');
          return;
        }
        const found = data.pack;
        const normalizeStatus = (s) => {
          const v = String(s || '').trim().toLowerCase();
          if (v === 'coming soon' || v === 'coming-soon' || v === 'coming up' || v === 'coming-up' || v === 'upcoming') return 'coming-soon';
          return v;
        };
        const normalizedFoundStatus = normalizeStatus(found.packStatus);
        const statuses = Array.from(new Set(['active', 'live', 'draft', 'closed', 'coming-soon', 'archived', normalizedFoundStatus].filter(Boolean)));
        setStatusOptions(statuses);
        setPackTitle(found.packTitle || found.title || '');
        setPackURL(found.packURL || found.url || '');
        setPackSummary(found.packSummary || found.summary || '');
        setPackLeague((found.packLeague || '').toString());
        if (found.packPrize || found.prize) setPackPrize(found.packPrize || found.prize);
        const cover = found.packCover || found.packCoverUrl || '';
        setPackCoverUrl(cover);
        if (cover) setCoverPreviewUrl(cover);
        setPackStatus(normalizedFoundStatus || 'active');
        // Initialize open time if present on detail payload
        if (found.packURL || found.url) {
          try {
            const detailRes = await fetch(`/api/packs/${encodeURIComponent(found.packURL || found.url)}`);
            const detailJson = await detailRes.json();
            if (detailRes.ok && detailJson.success && detailJson.pack) {
              const ot = detailJson.pack.packOpenTime;
              if (ot) {
                // Convert ISO to local datetime-local value
                const d = new Date(ot);
                const pad = (n) => String(n).padStart(2, '0');
                const local = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
                setPackOpenTime(local);
              }
              const ct = detailJson.pack.packCloseTime;
              if (ct) {
                const d2 = new Date(ct);
                const pad2 = (n) => String(n).padStart(2, '0');
                const local2 = `${d2.getFullYear()}-${pad2(d2.getMonth()+1)}-${pad2(d2.getDate())}T${pad2(d2.getHours())}:${pad2(d2.getMinutes())}`;
                setPackCloseTime(local2);
              }
              if (detailJson.pack.packEventId) {
                setPackEventId(detailJson.pack.packEventId);
              }
              if (Array.isArray(detailJson.pack.packEventIds)) {
                setPackEventIds(detailJson.pack.packEventIds);
              } else if (detailJson.pack.packEventId) {
                setPackEventIds([detailJson.pack.packEventId]);
              }
            }
          } catch {}
        }
        // Use packURL to fetch full details including props
        if (found.packURL || found.url) {
          const detailRes = await fetch(`/api/packs/${encodeURIComponent(found.packURL || found.url)}`);
          const detailJson = await detailRes.json();
          if (detailRes.ok && detailJson.success && detailJson.pack) {
            const props = Array.isArray(detailJson.pack.props) ? detailJson.pack.props : [];
            const normalized = props.map((p) => {
              // Resolve cover URL from attachments or string value
              let coverUrl = null;
              try {
                const fieldVal = p.propCover;
                if (Array.isArray(fieldVal) && fieldVal.length > 0) {
                  for (const entry of fieldVal) {
                    if (entry && typeof entry === 'object') {
                      if (typeof entry.url === 'string' && entry.url.startsWith('http')) { coverUrl = entry.url; break; }
                      const thumb = entry?.thumbnails?.large?.url || entry?.thumbnails?.full?.url;
                      if (typeof thumb === 'string' && thumb.startsWith('http')) { coverUrl = thumb; break; }
                    } else if (typeof entry === 'string' && entry.startsWith('http')) {
                      coverUrl = entry; break;
                    }
                  }
                } else if (typeof fieldVal === 'string' && fieldVal.startsWith('http')) {
                  coverUrl = fieldVal;
                }
              } catch {}
              return {
                airtableId: p.airtableId,
                propID: p.propID,
                propShort: p.propShort || p.propTitle || '',
                eventTitle: p.propEventTitleLookup || p.propEventMatchup || '',
                eventTime: p.propEventTimeLookup || null,
                propCoverUrl: coverUrl,
              };
            });
            setPropsList(normalized);
            if (detailJson.pack.packEventId) {
              setPackEventId(detailJson.pack.packEventId);
            }
          }
        }
      } catch (e) {
        console.error(e);
        setError(e.message || 'Failed to load pack');
      }
    })();
  }, [status, packId]);

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
      return !info || info.__needsHydration === true;
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
                // Collect basic facts about the event for quick display
                const ev = json.event;
                let coverUrl = null;
                try {
                  const fieldVal = ev.eventCover;
                  if (Array.isArray(fieldVal) && fieldVal.length > 0) {
                    const first = fieldVal[0];
                    coverUrl = (first && typeof first === 'object') ? (first.url || first?.thumbnails?.large?.url || first?.thumbnails?.full?.url) : null;
                  }
                } catch {}
                const firstString = (val) => {
                  try {
                    if (Array.isArray(val) && val.length) {
                      const v = val[0];
                      if (typeof v === 'string') return v;
                      if (v && typeof v === 'object' && typeof v.name === 'string') return v.name;
                    }
                  } catch {}
                  return null;
                };
                const homeTeamName = firstString(ev.homeTeam) || null;
                const awayTeamName = firstString(ev.awayTeam) || null;
                const homeTeamAbbr = ev.homeTeamAbbreviation || null;
                const awayTeamAbbr = ev.awayTeamAbbreviation || null;
                const homeTeamShortName = ev.homeTeamShortName || null;
                const awayTeamShortName = ev.awayTeamShortName || null;
                return {
                  id,
                  title: ev.eventTitle || id,
                  time: ev.eventTime || null,
                  league: ev.eventLeague || null,
                  coverUrl: coverUrl || null,
                  homeTeamLogo: ev.homeTeamLogo || null,
                  awayTeamLogo: ev.awayTeamLogo || null,
                  homeTeamName,
                  awayTeamName,
                  homeTeamAbbr,
                  awayTeamAbbr,
                  homeTeamShortName,
                  awayTeamShortName,
                };
              }
            } catch {}
            return { id, title: id, time: null };
          })
        );
        if (!cancelled) {
          setEventInfoById((prev) => {
            const next = { ...prev };
            results.forEach(({ id, title, time, league, coverUrl, homeTeamLogo, awayTeamLogo, homeTeamName, awayTeamName, homeTeamAbbr, awayTeamAbbr, homeTeamShortName, awayTeamShortName }) => {
              next[id] = { eventTitle: title, eventTime: time, eventLeague: league, eventCoverUrl: coverUrl, homeTeamLogo, awayTeamLogo, homeTeamName, awayTeamName, homeTeamAbbr, awayTeamAbbr, homeTeamShortName, awayTeamShortName };
            });
            return next;
          });
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [packEventIds, packEventId]);

  // Load default AI model
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/admin/aiConfig');
        const data = await res.json();
        if (res.ok && data.success && data.defaultModel) {
          setAiModel(data.defaultModel);
        }
      } catch {}
    })();
  }, []);

  const handleGenerateSummary = async () => {
    try {
      const evId = packEventId;
      if (!evId) {
        setError('Link an event to this pack to generate a summary.');
        return;
      }
      setGeneratingSummary(true);
      setError(null);
      const res = await fetch('/api/admin/generatePropSummary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId: evId, context: aiContext, model: aiModel }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'AI summary generation failed');
      }
      if (typeof data.summary === 'string') {
        setPackSummary(data.summary);
      }
    } catch (e) {
      setError(e.message || 'AI summary generation failed');
    } finally {
      setGeneratingSummary(false);
    }
  };

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

  const handleRemoveLinkedEvent = () => {
    if (!packEventId) return;
    setPackEventIds(prev => {
      const next = (prev || []).filter(id => id !== packEventId);
      setPackEventId(next.length > 0 ? next[0] : '');
      return next;
    });
  };

  const handleUseEventCover = async () => {
    try {
      // Prefer linked Event on the pack
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

  if (status === 'loading') {
    return <div className="container mx-auto px-4 py-6">Loading...</div>;
  }
  if (!session) {
    return <div className="container mx-auto px-4 py-6">Not authorized</div>;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!packId) return;
    setLoading(true);
    setError(null);
    try {
      const payload = { packId, packTitle, packURL };
      if (packSummary) payload.packSummary = packSummary;
      if (packLeague) payload.packLeague = packLeague.toLowerCase();
      if (packPrize) payload.prize = packPrize;
      if (packCoverUrl) payload.packCoverUrl = packCoverUrl;
      if (packStatus) payload.packStatus = packStatus;
      if (packOpenTime) payload.packOpenTime = new Date(packOpenTime).toISOString();
      if (packCloseTime) payload.packCloseTime = new Date(packCloseTime).toISOString();
      // Always include props array to allow server to sync membership (including unlinking all)
      payload.props = propsList.map(p => p.airtableId);
      if (Array.isArray(packEventIds) && packEventIds.length > 0) {
        payload.events = packEventIds;
      } else if (packEventId) {
        payload.events = [packEventId];
      }

      const res = await fetch('/api/packs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to update pack');
      }

      // Update prop order mapping for each prop
      if (propsList.length > 0) {
        const pid = data.record?.id || packId;
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
      router.push(`/admin/packs/${packId}`);
    } catch (err) {
      setError(err.message || 'Failed to update pack.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold mb-4">Edit Pack</h1>
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
                        // Seed titles from selection
                        setEventInfoById(prev => {
                          const next = { ...prev };
                        ev.forEach(e => { if (e?.id) next[e.id] = { eventTitle: e.eventTitle || e.id, eventTime: null, __needsHydration: true }; });
                          return next;
                        });
                      } else {
                        if (!ev || !ev.id) return;
                        setPackEventId(ev.id);
                        setPackEventIds(prev => Array.from(new Set([...(prev || []), ev.id])));
                      setEventInfoById(prev => ({ ...prev, [ev.id]: { eventTitle: ev.eventTitle || ev.id, eventTime: null, __needsHydration: true } }));
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
              // Fallbacks from props if event API is sparse
              const fallbackTitle = (() => {
                try {
                  const firstWithTitle = (propsList || []).find(p => p.eventTitle);
                  return firstWithTitle ? firstWithTitle.eventTitle : null;
                } catch { return null; }
              })();
              const fallbackTimeISO = (() => {
                try {
                  const times = (propsList || []).map(p => new Date(p.eventTime).getTime()).filter((t) => Number.isFinite(t));
                  if (!times.length) return null;
                  const earliest = Math.min(...times);
                  return new Date(earliest).toISOString();
                } catch { return null; }
              })();
              const title = info.eventTitle || fallbackTitle || packEventId;
              const league = info.eventLeague ? String(info.eventLeague).toUpperCase() : null;
              const timeSource = info.eventTime || fallbackTimeISO;
              const time = timeSource
                ? new Date(timeSource).toLocaleString(undefined, {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                    timeZoneName: 'short',
                  })
                : null;
              const cover = info.eventCoverUrl || (() => {
                try {
                  const firstWithCover = (propsList || []).find(p => p.propCoverUrl);
                  return firstWithCover ? firstWithCover.propCoverUrl : null;
                } catch { return null; }
              })();
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
                      <span className="mx-2 text-gray-400">|</span>
                      <button type="button" onClick={handleRemoveLinkedEvent} className="text-red-600 underline">Remove linked event</button>
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
          <div className="mt-2 space-y-2">
            <div className="grid grid-cols-1 md:grid-cols-3 md:items-start gap-2">
              <div className="md:col-span-2">
                <textarea
                  rows={2}
                  value={aiContext}
                  onChange={(e) => setAiContext(e.target.value)}
                  className="w-full px-3 py-2 border rounded"
                  placeholder="Optional context: paste latest news or stats"
                />
              </div>
              <div className="flex items-center gap-2 md:justify-end">
                <select
                  value={aiModel}
                  onChange={(e) => setAiModel(e.target.value)}
                  className="px-2 py-2 border rounded bg-white"
                >
                  <option value="gpt-5-mini">gpt-5-mini</option>
                  <option value="gpt-5">gpt-5</option>
                  <option value="gpt-4.1">gpt-4.1</option>
                  <option value="gpt-4o-mini">gpt-4o-mini</option>
                </select>
                <button
                  type="button"
                  className="px-3 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
                  onClick={handleGenerateSummary}
                  disabled={generatingSummary || !packEventId}
                  title={!packEventId ? 'Link an event first' : ''}
                >
                  {generatingSummary ? 'Generating…' : 'Generate from AI'}
                </button>
              </div>
            </div>
            {!packEventId && (
              <div className="text-xs text-gray-500">Link an event to enable AI summary.</div>
            )}
          </div>
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
            <button
              type="button"
              className="px-3 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300 disabled:opacity-50"
              disabled={!packEventTimeISO}
              onClick={() => {
                try {
                  const d = new Date(packEventTimeISO);
                  const dt = new Date(d.getTime() - 1 * 60 * 60 * 1000);
                  const pad = (n) => String(n).padStart(2, '0');
                  const local = `${dt.getFullYear()}-${pad(dt.getMonth()+1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
                  setPackOpenTime(local);
                } catch {}
              }}
            >
              1 hour before event
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
            <Link href={`/admin/packs/${encodeURIComponent(packId)}/create-prop`}>
              <button
                type="button"
                className="ml-2 px-3 py-2 bg-green-600 text-white rounded hover:bg-green-700"
              >
                New Prop
              </button>
            </Link>
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
                        <Link href={`/admin/props/${encodeURIComponent(prop.airtableId)}`}>
                          <button type="button" className="px-2 py-1 text-blue-600 hover:underline">Edit</button>
                        </Link>
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
            {loading ? 'Saving...' : 'Save Changes'}
          </button>
          <Link href={`/admin/packs/${packId}`}>
            <button
              type="button"
              className="px-4 py-2 bg-gray-300 text-gray-800 rounded hover:bg-gray-400"
            >
              Cancel
            </button>
          </Link>
          <button
            type="button"
            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
            onClick={async () => {
              try {
                if (!packId) return;
                const ok = window.confirm('Delete this pack? This cannot be undone.');
                if (!ok) return;
                setLoading(true);
                setError(null);
                const res = await fetch(`/api/packs?packId=${encodeURIComponent(packId)}`, { method: 'DELETE' });
                const data = await res.json();
                if (!res.ok || !data.success) throw new Error(data.error || 'Failed to delete pack');
                router.push('/admin/packs');
              } catch (e) {
                setError(e.message || 'Failed to delete pack');
              } finally {
                setLoading(false);
              }
            }}
          >
            Delete Pack
          </button>
        </div>
      </form>
    </div>
  );
}


