import React, { useEffect, useState } from 'react';

export default function AISummaryModal({ isOpen, onClose, eventId, defaultModel, onGenerated, propShort }) {
  const [context, setContext] = useState('');
  const [model, setModel] = useState(defaultModel || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState('');
  const [suggestedPrompt, setSuggestedPrompt] = useState('');
  const [copying, setCopying] = useState(false);
  const [wordsMax, setWordsMax] = useState(40);

  useEffect(() => {
    if (model) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/admin/aiConfig');
        const data = await res.json().catch(() => ({}));
        if (!cancelled && res.ok && data?.success && data?.defaultModel) {
          setModel(data.defaultModel);
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [model]);

  if (!isOpen) return null;

  // Build suggested prompt for external AI usage
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!eventId) { setSuggestedPrompt(''); return; }
        const res = await fetch(`/api/admin/events/${encodeURIComponent(eventId)}`);
        const json = await res.json();
        let away = '';
        let home = '';
        let whenStr = '';
        if (res.ok && json?.success && json?.event) {
          const ev = json.event;
          const pick = (name, abbr, shortName) => (shortName || name || abbr || '').toString().trim();
          const awayName = ev.awayTeamShortName || ev.awayTeamName || ev.awayTeamAbbreviation || '';
          const homeName = ev.homeTeamShortName || ev.homeTeamName || ev.homeTeamAbbreviation || '';
          away = pick(awayName, ev.awayTeamAbbreviation, ev.awayTeamShortName);
          home = pick(homeName, ev.homeTeamAbbreviation, ev.homeTeamShortName);
          if (ev.eventTime) {
            try {
              const d = new Date(ev.eventTime);
              whenStr = d.toLocaleString();
            } catch {}
          }
        }
        if (!away || !home) {
          away = 'Away Team';
          home = 'Home Team';
        }
        const propHint = (typeof propShort === 'string' && propShort.trim().length)
          ? `, specifically around the proposition "${propShort.trim()}"`
          : '';
        const text = `Search the web for the latest news and statistics around the game between ${away} and ${home}${whenStr ? ` on ${whenStr}` : ''}${propHint}. Write this in long paragraph format filled with stats and narratives.`;
        if (!cancelled) setSuggestedPrompt(text);
      } catch {
        const fallback = 'Search the web for the latest news and statistics around the upcoming game. Write this in long paragraph format filled with stats and narratives.';
        if (!cancelled) setSuggestedPrompt(fallback);
      }
    })();
    return () => { cancelled = true; };
  }, [eventId, propShort]);

  const generate = async () => {
    try {
      if (!eventId) { setError('Link an event to enable AI summary.'); return; }
      setLoading(true);
      setError('');
      setResult('');
      const res = await fetch('/api/admin/generatePropSummary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId, context, model, wordsMax }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success || typeof data.summary !== 'string') {
        throw new Error(data?.error || 'AI summary generation failed');
      }
      setResult(data.summary);
    } catch (e) {
      setError(e?.message || 'AI summary generation failed');
    } finally {
      setLoading(false);
    }
  };

  const useResult = () => {
    if (typeof onGenerated === 'function' && typeof result === 'string') {
      onGenerated(result);
    }
    onClose();
  };

  const copySuggestedPrompt = async () => {
    try {
      await navigator.clipboard.writeText(suggestedPrompt || '');
      setCopying(true);
      setTimeout(() => setCopying(false), 1200);
    } catch {}
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white rounded shadow-lg w-full max-w-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold">Generate AI Summary</h3>
          <button type="button" onClick={onClose} className="text-gray-600 hover:text-gray-900">✕</button>
        </div>
        <div className="space-y-3">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium text-gray-700">Suggested prompt for external AI</label>
              <button
                type="button"
                onClick={copySuggestedPrompt}
                className="text-xs px-2 py-1 bg-gray-200 rounded hover:bg-gray-300"
                disabled={!suggestedPrompt}
              >
                {copying ? 'Copied' : 'Copy'}
              </button>
            </div>
            <textarea
              readOnly
              rows={3}
              className="w-full px-3 py-2 border rounded bg-gray-50"
              value={suggestedPrompt}
            />
            <div className="mt-1 text-xs text-gray-500">Copy this, paste it into your external AI to gather latest news/stats, then paste that output below as Additional context.</div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Optional context</label>
            <textarea
              rows={3}
              value={context}
              onChange={(e) => setContext(e.target.value)}
              className="mt-1 w-full px-3 py-2 border rounded"
              placeholder="Paste latest news or stats"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-700">Model</label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="px-2 py-2 border rounded bg-white"
            >
              <option value="gpt-5-mini">gpt-5-mini</option>
              <option value="gpt-5">gpt-5</option>
              <option value="gpt-4.1">gpt-4.1</option>
              <option value="gpt-4o-mini">gpt-4o-mini</option>
            </select>
            <div className="flex items-center gap-1">
              <label className="text-sm text-gray-700">Max words</label>
              <input
                type="number"
                min={10}
                max={200}
                value={wordsMax}
                onChange={(e) => {
                  const n = parseInt(e.target.value, 10);
                  if (Number.isFinite(n)) setWordsMax(Math.max(10, Math.min(200, n)));
                }}
                className="w-20 px-2 py-2 border rounded"
              />
            </div>
            <button
              type="button"
              className="ml-auto px-3 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
              onClick={generate}
              disabled={loading || !eventId}
              title={!eventId ? 'Link an event first' : ''}
            >
              {loading ? 'Generating…' : 'Generate'}
            </button>
          </div>
          {error && <div className="text-sm text-red-600">{error}</div>}
          <div>
            <label className="block text-sm font-medium text-gray-700">Preview</label>
            <div className="mt-1 whitespace-pre-wrap text-sm bg-gray-50 border rounded p-2 max-h-60 overflow-auto">
              {result ? result : <em>(empty)</em>}
            </div>
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-3 py-2 bg-gray-200 rounded hover:bg-gray-300">Cancel</button>
          <button type="button" onClick={useResult} disabled={!result} className="px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">Use this</button>
        </div>
      </div>
    </div>
  );
}


