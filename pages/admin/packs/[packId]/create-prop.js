import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useModal } from '../../../../contexts/ModalContext';

export default function CreatePackPropPage() {
  const router = useRouter();
  const { packId } = router.query;
  const { openModal } = useModal();

  const [propShort, setPropShort] = useState('');
  const [propSummary, setPropSummary] = useState('');
  const [propSideAShort, setPropSideAShort] = useState('');
  const [propSideATake, setPropSideATake] = useState('');
  const [propSideAMoneyline, setPropSideAMoneyline] = useState('');
  const [propSideBShort, setPropSideBShort] = useState('');
  const [propSideBTake, setPropSideBTake] = useState('');
  const [propSideBMoneyline, setPropSideBMoneyline] = useState('');
  const [propOpenTime, setPropOpenTime] = useState('');
  const [propCloseTime, setPropCloseTime] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [linkedEvent, setLinkedEvent] = useState(null);
  const [propCoverSource, setPropCoverSource] = useState('custom');
  const [coverFile, setCoverFile] = useState(null);
  const [coverPreview, setCoverPreview] = useState(null);
  const [eventCoverUrl, setEventCoverUrl] = useState(null);
  const [teamCoverUrl, setTeamCoverUrl] = useState(null);
  const [teamOptions, setTeamOptions] = useState([]);

  const formatDateTimeLocal = (iso) => {
    try {
      const d = new Date(iso);
      const pad = (n) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    } catch {
      return '';
    }
  };

  const resolveTeamLogoUrl = (teamRecordId) => {
    try {
      const t = teamOptions.find(team => String(team.recordId) === String(teamRecordId));
      if (!t) return null;
      const arr = Array.isArray(t.teamLogo) ? t.teamLogo : [];
      const attachmentUrl = arr.length > 0 && arr[0] && typeof arr[0].url === 'string' ? arr[0].url : null;
      return t.teamLogoURL || attachmentUrl || null;
    } catch {
      return null;
    }
  };

  // Default open time to today noon local
  useEffect(() => {
    if (propOpenTime) return;
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    const pad = (n) => String(n).padStart(2, '0');
    const local = `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
    setPropOpenTime(local);
  }, []);

  // When linkedEvent changes, fetch event details and set event cover + team links
  useEffect(() => {
    if (!linkedEvent?.id) { setEventCoverUrl(null); return; }
    fetch(`/api/admin/events/${linkedEvent.id}`)
      .then(r => r.json())
      .then(data => {
        if (data?.success && data?.event) {
          const ev = data.event;
          setLinkedEvent(prev => ({
            id: prev?.id || linkedEvent.id,
            eventTitle: prev?.eventTitle || linkedEvent.eventTitle,
            eventTime: ev.eventTime || prev?.eventTime || null,
            eventLeague: ev.eventLeague || prev?.eventLeague || null,
            homeTeamLink: ev.homeTeamLink || prev?.homeTeamLink || [],
            awayTeamLink: ev.awayTeamLink || prev?.awayTeamLink || [],
          }));
          // Resolve event cover
          const fieldVal = ev.eventCover;
          let url = null;
          try {
            if (Array.isArray(fieldVal) && fieldVal.length > 0) {
              for (const entry of fieldVal) {
                if (entry && typeof entry === 'object') {
                  if (typeof entry.url === 'string' && entry.url.startsWith('http')) { url = entry.url; break; }
                  const thumbUrl = entry?.thumbnails?.large?.url || entry?.thumbnails?.full?.url;
                  if (typeof thumbUrl === 'string' && thumbUrl.startsWith('http')) { url = thumbUrl; break; }
                } else if (typeof entry === 'string' && entry.startsWith('http')) {
                  url = entry; break;
                }
              }
            }
          } catch {}
          setEventCoverUrl(url);
        } else {
          setEventCoverUrl(null);
        }
      })
      .catch(() => setEventCoverUrl(null));
  }, [linkedEvent?.id]);

  // Fetch team options once event league is known (load all, we'll match by recordId)
  useEffect(() => {
    if (!linkedEvent?.eventLeague) { setTeamOptions([]); return; }
    fetch('/api/teams')
      .then(r => r.json())
      .then(json => {
        if (json?.success) {
          // Prefer teams matching league (case-insensitive); fallback to all if none
          const league = String(linkedEvent.eventLeague || '').toLowerCase();
          const matching = json.teams.filter(t => String(t.teamType || '').toLowerCase() === league);
          setTeamOptions(matching.length ? matching : json.teams);
        } else { setTeamOptions([]); }
      })
      .catch(() => setTeamOptions([]));
  }, [linkedEvent?.eventLeague]);

  // Recompute team cover preview when source, options, or linked team links change
  useEffect(() => {
    if (!linkedEvent) { setTeamCoverUrl(null); return; }
    const pickFrom = propCoverSource === 'homeTeam' ? (linkedEvent.homeTeamLink || []) : propCoverSource === 'awayTeam' ? (linkedEvent.awayTeamLink || []) : [];
    const teamId = Array.isArray(pickFrom) && pickFrom.length ? pickFrom[0] : null;
    if (teamId) {
      setTeamCoverUrl(resolveTeamLogoUrl(teamId));
    } else {
      setTeamCoverUrl(null);
    }
  }, [propCoverSource, teamOptions, linkedEvent?.homeTeamLink, linkedEvent?.awayTeamLink]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!packId) {
      setError('Missing packId in URL');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      // Prepare cover upload if custom
      let propCoverUrl = null;
      if (propCoverSource === 'custom' && coverFile) {
        const toBase64 = (file) => new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.readAsDataURL(file);
          reader.onload = () => resolve(reader.result.split(',')[1]);
          reader.onerror = (err) => reject(err);
        });
        try {
          const fileData = await toBase64(coverFile);
          const coverRes = await fetch('/api/admin/uploadPropCover', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename: coverFile.name, fileData })
          });
          const coverData = await coverRes.json();
          if (!coverData.success) throw new Error('Cover upload failed');
          propCoverUrl = coverData.url;
        } catch (uploadErr) {
          setError(uploadErr.message || 'Cover upload failed');
          setLoading(false);
          return;
        }
      }

      const payload = {
        propShort,
        propSummary,
        PropSideAShort: propSideAShort,
        PropSideATake: propSideATake,
        PropSideAMoneyline: propSideAMoneyline,
        PropSideBShort: propSideBShort,
        PropSideBTake: propSideBTake,
        PropSideBMoneyline: propSideBMoneyline,
        propOpenTime,
        propCloseTime,
        packId,
        ...(linkedEvent?.id ? { eventId: linkedEvent.id } : {}),
        propValueModel: 'vegas',
        propType: 'moneyline',
        propCoverSource,
        // For team logo sources, do not persist propCover; resolve dynamically at read time
        ...(propCoverUrl ? { propCover: propCoverUrl } : {}),
      };

      const res = await fetch('/api/props', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        router.push(`/admin/packs/${packId}/edit`);
      } else {
        setError(data.error || 'Failed to create prop');
      }
    } catch (err) {
      setError(err.message || 'Failed to create prop');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 max-w-6xl mx-auto">
      {/* Link Event section */}
      <div className="mb-4 p-4 border rounded bg-white">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-lg font-semibold">Link Event (optional)</div>
            <div className="text-sm text-gray-700">
              {linkedEvent ? (
                <>
                  <div className="font-medium">{linkedEvent.eventTitle || linkedEvent.id}</div>
                </>
              ) : (
                <span>No event linked</span>
              )}
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <button
              type="button"
              className="px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              onClick={() => openModal('addEvent', {
                allowMultiSelect: false,
                onEventSelected: (ev) => {
                  try {
                    const chosen = Array.isArray(ev) ? (ev[0] || null) : ev;
                    if (!chosen?.id) { setLinkedEvent(null); return; }
                    // Fetch full event details to get eventTime and cover and team links
                    fetch(`/api/admin/events/${chosen.id}`)
                      .then(r => r.json())
                      .then(data => {
                        if (data?.success && data?.event) {
                          setLinkedEvent({
                            id: chosen.id,
                            eventTitle: chosen.eventTitle,
                            eventTime: data.event.eventTime || null,
                            eventLeague: data.event.eventLeague,
                            homeTeamLink: data.event.homeTeamLink || [],
                            awayTeamLink: data.event.awayTeamLink || [],
                          });
                        } else {
                          setLinkedEvent({ id: chosen.id, eventTitle: chosen.eventTitle });
                        }
                      })
                      .catch(() => setLinkedEvent(chosen));
                  } catch {}
                },
              })}
            >
              Select Event
            </button>
            {linkedEvent && (
              <button
                type="button"
                className="px-3 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300"
                onClick={() => setLinkedEvent(null)}
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </div>
      <div className="mb-4 p-4 bg-gray-100 rounded">
        <h2 className="text-xl font-semibold">Linked Pack</h2>
        <div className="mt-1 text-sm text-gray-700">Airtable Record ID: {packId || '—'}</div>
        <p className="text-xs text-gray-600 mt-1">This new prop will be linked to the pack above.</p>
      </div>

      {/* Prop Card Image Source */}
      <div className="mb-4 p-4 border rounded bg-white">
        <div className="text-lg font-semibold">Prop Card Image Source</div>
        <label className="block text-sm font-medium text-gray-700 mt-2">Source</label>
        <select
          className="mt-1 block w-full border rounded px-2 py-1"
          value={propCoverSource}
          onChange={(e) => {
            const v = e.target.value;
            setPropCoverSource(v);
            if (v !== 'custom') { setCoverFile(null); setCoverPreview(null); }
          }}
        >
          <option value="event" disabled={!linkedEvent}>Use event cover {linkedEvent ? '' : '(link an event to enable)'}</option>
          <option value="homeTeam" disabled={!linkedEvent}>Use home team logo</option>
          <option value="awayTeam" disabled={!linkedEvent}>Use away team logo</option>
          <option value="custom">Custom upload</option>
        </select>
        {/* Resolved URL display under the source dropdown */}
        {propCoverSource === 'event' && eventCoverUrl && (
          <div className="mt-2 text-xs text-gray-700">
            <div className="mb-1">URL:</div>
            <a href={eventCoverUrl} target="_blank" rel="noopener noreferrer" className="block px-2 py-1 border rounded bg-gray-50 break-all">
              {eventCoverUrl}
            </a>
          </div>
        )}
        {(propCoverSource === 'homeTeam' || propCoverSource === 'awayTeam') && teamCoverUrl && (
          <div className="mt-2 text-xs text-gray-700">
            <div className="mb-1">URL:</div>
            <a href={teamCoverUrl} target="_blank" rel="noopener noreferrer" className="block px-2 py-1 border rounded bg-gray-50 break-all">
              {teamCoverUrl}
            </a>
          </div>
        )}
        {propCoverSource === 'event' && (
          <div className="mt-2">
            <div className="text-sm text-gray-700">Preview</div>
            {eventCoverUrl ? (
              <img src={eventCoverUrl} alt="Event Cover" className="mt-2 h-32 object-contain" />
            ) : (
              <div className="mt-2 text-xs text-gray-500">No event cover available</div>
            )}
          </div>
        )}
        {(propCoverSource === 'homeTeam' || propCoverSource === 'awayTeam') && (
          <div className="mt-2">
            <div className="text-sm text-gray-700">Team Logo Preview</div>
            {teamCoverUrl ? (
              <img src={teamCoverUrl} alt="Team Logo" className="mt-2 h-32 object-contain" />
            ) : (
              <div className="mt-2 text-xs text-gray-500">No team logo available</div>
            )}
          </div>
        )}
        {propCoverSource === 'custom' && (
          <div className="mt-2">
            <label className="block text-sm font-medium text-gray-700">Upload Cover</label>
            <input
              type="file"
              accept="image/*"
              className="mt-1 block w-full"
              onChange={(e) => {
                const file = e.target.files && e.target.files[0];
                setCoverFile(file || null);
                setCoverPreview(file ? URL.createObjectURL(file) : null);
              }}
            />
            {coverPreview && (
              <img src={coverPreview} alt="Cover Preview" className="mt-2 h-32 object-contain" />
            )}
          </div>
        )}
      </div>

      <h1 className="text-2xl font-bold mb-4">Create a Prop</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">Short Label</label>
          <input className="mt-1 block w-full border rounded px-2 py-1" value={propShort} onChange={(e)=> setPropShort(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Summary</label>
          <textarea className="mt-1 block w-full border rounded px-2 py-1" value={propSummary} onChange={(e)=> setPropSummary(e.target.value)} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <h3 className="font-semibold">Side A</h3>
            <label className="block text-sm">Label</label>
            <input className="mt-1 block w-full border rounded px-2 py-1" value={propSideAShort} onChange={(e)=> setPropSideAShort(e.target.value)} />
            <label className="block text-sm mt-2">Take</label>
            <input className="mt-1 block w-full border rounded px-2 py-1" value={propSideATake} onChange={(e)=> setPropSideATake(e.target.value)} />
            <label className="block text-sm mt-2">Moneyline</label>
            <input type="number" className="mt-1 block w-full border rounded px-2 py-1" value={propSideAMoneyline} onChange={(e)=> setPropSideAMoneyline(e.target.value)} />
          </div>
          <div>
            <h3 className="font-semibold">Side B</h3>
            <label className="block text-sm">Label</label>
            <input className="mt-1 block w-full border rounded px-2 py-1" value={propSideBShort} onChange={(e)=> setPropSideBShort(e.target.value)} />
            <label className="block text-sm mt-2">Take</label>
            <input className="mt-1 block w-full border rounded px-2 py-1" value={propSideBTake} onChange={(e)=> setPropSideBTake(e.target.value)} />
            <label className="block text-sm mt-2">Moneyline</label>
            <input type="number" className="mt-1 block w-full border rounded px-2 py-1" value={propSideBMoneyline} onChange={(e)=> setPropSideBMoneyline(e.target.value)} />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Open Time</label>
            <input type="datetime-local" className="mt-1 block w-full border rounded px-2 py-1" value={propOpenTime} onChange={(e)=> setPropOpenTime(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Close Time</label>
            <input type="datetime-local" className="mt-1 block w-full border rounded px-2 py-1" value={propCloseTime} onChange={(e)=> setPropCloseTime(e.target.value)} />
            <div className="mt-1">
              <button
                type="button"
                disabled={!linkedEvent?.eventTime}
                onClick={() => setPropCloseTime(formatDateTimeLocal(linkedEvent.eventTime))}
                className={`text-sm px-3 py-1 rounded ${linkedEvent?.eventTime ? 'bg-gray-200 text-gray-800 hover:bg-gray-300' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}
              >
                When event starts
              </button>
            </div>
          </div>
        </div>

        {error && <p className="text-red-600">{error}</p>}
        <button type="submit" disabled={loading} className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50">
          {loading ? 'Creating…' : 'Create Prop'}
        </button>
      </form>
    </div>
  );
}


