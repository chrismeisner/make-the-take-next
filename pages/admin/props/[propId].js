import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useModal } from '../../../contexts/ModalContext';

export default function EditPropPage() {
  const router = useRouter();
  const { propId } = router.query;
  const { openModal } = useModal();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [generatingSummary, setGeneratingSummary] = useState(false);

  // Form fields (mirroring create-prop, but prefilled)
  const [propShort, setPropShort] = useState('');
  const [propSummary, setPropSummary] = useState('');
  const [propValueModel, setPropValueModel] = useState('vegas');
  const [propType, setPropType] = useState('moneyline');
  const [propStatus, setPropStatus] = useState('open');
  const [PropSideAShort, setPropSideAShort] = useState('');
  const [PropSideATake, setPropSideATake] = useState('');
  const [PropSideAMoneyline, setPropSideAMoneyline] = useState('');
  const [PropSideBShort, setPropSideBShort] = useState('');
  const [PropSideBTake, setPropSideBTake] = useState('');
  const [PropSideBMoneyline, setPropSideBMoneyline] = useState('');
  const [teams, setTeams] = useState([]);
  const [propOpenTime, setPropOpenTime] = useState('');
  const [propCloseTime, setPropCloseTime] = useState('');
  const [propCoverSource, setPropCoverSource] = useState('event');
  const [event, setEvent] = useState(null);

  const formatDateTimeLocal = (iso) => {
    if (!iso) return '';
    try {
      const dt = new Date(iso);
      const pad = (n) => n.toString().padStart(2, '0');
      return `${dt.getFullYear()}-${pad(dt.getMonth()+1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
    } catch {
      return '';
    }
  };

  useEffect(() => {
    if (!propId) return;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const res = await fetch(`/api/admin/props/${propId}`);
        const data = await res.json();
        if (!data.success) throw new Error(data.error || 'Failed to load prop');
        const p = data.prop;
        setPropShort(p.propShort || '');
        setPropSummary(p.propSummary || '');
        setPropValueModel(p.propValueModel || 'vegas');
        setPropType(p.propType || 'moneyline');
        setPropStatus(p.propStatus || 'open');
        setPropSideAShort(p.PropSideAShort || '');
        setPropSideATake(p.PropSideATake || '');
        setPropSideAMoneyline(p.PropSideAMoneyline != null ? String(p.PropSideAMoneyline) : '');
        setPropSideBShort(p.PropSideBShort || '');
        setPropSideBTake(p.PropSideBTake || '');
        setPropSideBMoneyline(p.PropSideBMoneyline != null ? String(p.PropSideBMoneyline) : '');
        setTeams(Array.isArray(p.teams) ? p.teams : []);
        setPropOpenTime(formatDateTimeLocal(p.propOpenTime));
        setPropCloseTime(formatDateTimeLocal(p.propCloseTime));
        setPropCoverSource(p.propCoverSource || 'event');
        setEvent(p.event || null);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [propId]);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!propId) return;
    setSaving(true);
    setError(null);
    try {
      const payload = {
        propId,
        propStatus,
        propShort,
        propSummary,
        PropSideAShort,
        PropSideATake,
        PropSideAMoneyline,
        PropSideBShort,
        PropSideBTake,
        PropSideBMoneyline,
        propType,
        teams,
        propValueModel,
        propCloseTime,
        propCoverSource,
      };
      const res = await fetch('/api/props', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to save');
      // Go back to Admin Props list
      router.push('/admin/props');
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  // Generate AI Summary (reuse events create-prop flow)
  const handleGenerateSummary = async (context, model) => {
    if (!event?.airtableId) {
      setError('Missing eventId for summary generation');
      return;
    }
    setGeneratingSummary(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/generatePropSummary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId: event.airtableId, context, model }),
      });
      const data = await res.json();
      if (data.success) {
        return data.summary;
      } else {
        setError(data.error || 'AI summary generation failed');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setGeneratingSummary(false);
    }
  };

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Edit Prop</h1>
      {event && (
        <div className="mb-4 p-3 bg-gray-50 rounded border">
          <div className="font-medium">{event.eventTitle}</div>
          <div className="text-sm text-gray-600">{event.eventLeague} — {event.eventTime ? new Date(event.eventTime).toLocaleString() : ''}</div>
        </div>
      )}
      <form onSubmit={handleSave} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">Short Label</label>
          <input className="mt-1 block w-full border rounded px-2 py-1" value={propShort} onChange={(e) => setPropShort(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Value Model</label>
          <select className="mt-1 block w-full border rounded px-2 py-1" value={propValueModel} onChange={(e) => setPropValueModel(e.target.value)}>
            <option value="vegas">Vegas</option>
            <option value="popular">Popular</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Summary</label>
          <textarea className="mt-1 block w-full border rounded px-2 py-1" value={propSummary} onChange={(e) => setPropSummary(e.target.value)} />
          <button
            type="button"
            onClick={() => {
              const eventDateTime = event?.eventTime ? new Date(event.eventTime).toLocaleString() : 'the scheduled time';
              const defaultPrompt = `Search the web for the latest news and statistics around ${event?.eventTitle || 'this event'} on ${eventDateTime}. Write this in long paragraph format filled with stats and narratives.`;
              const serverPrompt = `Write a 30 words max summary previewing ${event?.eventTitle || 'the upcoming game'} on ${eventDateTime} in the ${event?.eventLeague || ''}, use relevant narratives and stats.`;
              openModal('aiSummaryContext', {
                defaultPrompt,
                serverPrompt,
                defaultModel: process.env.NEXT_PUBLIC_OPENAI_DEFAULT_MODEL || 'gpt-4.1',
                onGenerate: handleGenerateSummary,
                onUse: (text) => setPropSummary(text),
              });
            }}
            disabled={generatingSummary || !event}
            className={`mt-2 text-sm ${generatingSummary ? 'bg-gray-400' : 'bg-indigo-600 hover:bg-indigo-700'} text-white rounded px-3 py-1`}
          >
            {generatingSummary ? 'Generating…' : 'Generate AI Summary'}
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <h3 className="font-semibold">Side A</h3>
            <label className="block text-sm">Label</label>
            <input className="mt-1 block w-full border rounded px-2 py-1" value={PropSideAShort} onChange={(e) => setPropSideAShort(e.target.value)} />
            <label className="block text-sm mt-2">Take</label>
            <input className="mt-1 block w-full border rounded px-2 py-1" value={PropSideATake} onChange={(e) => setPropSideATake(e.target.value)} />
            {propValueModel === 'vegas' && (
              <>
                <label className="block text-sm mt-2">Moneyline</label>
                <input type="number" className="mt-1 block w-full border rounded px-2 py-1" value={PropSideAMoneyline} onChange={(e) => setPropSideAMoneyline(e.target.value)} />
              </>
            )}
          </div>
          <div>
            <h3 className="font-semibold">Side B</h3>
            <label className="block text-sm">Label</label>
            <input className="mt-1 block w-full border rounded px-2 py-1" value={PropSideBShort} onChange={(e) => setPropSideBShort(e.target.value)} />
            <label className="block text-sm mt-2">Take</label>
            <input className="mt-1 block w-full border rounded px-2 py-1" value={PropSideBTake} onChange={(e) => setPropSideBTake(e.target.value)} />
            {propValueModel === 'vegas' && (
              <>
                <label className="block text-sm mt-2">Moneyline</label>
                <input type="number" className="mt-1 block w-full border rounded px-2 py-1" value={PropSideBMoneyline} onChange={(e) => setPropSideBMoneyline(e.target.value)} />
              </>
            )}
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Open Time</label>
            <input type="datetime-local" className="mt-1 block w-full border rounded px-2 py-1" value={propOpenTime} onChange={(e) => setPropOpenTime(e.target.value)} disabled />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Close Time</label>
            <input type="datetime-local" className="mt-1 block w-full border rounded px-2 py-1" value={propCloseTime} onChange={(e) => setPropCloseTime(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Cover Source</label>
          <select className="mt-1 block w-full border rounded px-2 py-1" value={propCoverSource} onChange={(e) => setPropCoverSource(e.target.value)}>
            <option value="event">Event</option>
            <option value="custom">Custom</option>
          </select>
        </div>
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <div className="flex gap-2">
          <button type="submit" disabled={saving} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">{saving ? 'Saving…' : 'Save'}</button>
          <button type="button" onClick={() => router.back()} className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700">Cancel</button>
        </div>
      </form>
    </div>
  );
}


