import React, { useMemo, useState } from 'react';

export default function SubscribeModal({ isOpen, onClose, category = 'pack_open', league = '', team = null, series = null, teams = [], seriesList = [], onSubscribed }) {
  const [loading, setLoading] = useState(false);
  const [selectedLeague, setSelectedLeague] = useState(Boolean(league));
  const initialTeamSlugs = useMemo(() => new Set((teams || []).map((t) => String(t?.slug || '').toLowerCase()).filter(Boolean)), [teams]);
  const [selectedTeams, setSelectedTeams] = useState(initialTeamSlugs);
  const [selectedSeries, setSelectedSeries] = useState(Boolean(series) || (Array.isArray(seriesList) && seriesList.length > 0));
  const [seriesSelection, setSeriesSelection] = useState(() => {
    const set = new Set();
    if (series?.id || series?.slug || series?.series_id) set.add(String(series?.series_id || series?.slug || series?.id));
    (Array.isArray(seriesList) ? seriesList : []).forEach((s) => {
      const key = String(s?.series_id || s?.id || '').trim();
      if (key) set.add(key);
    });
    return set;
  });
  if (!isOpen) return null;

  function toggleTeam(slug) {
    const key = String(slug || '').toLowerCase();
    setSelectedTeams((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  async function handleSubscribe() {
    try {
      setLoading(true);
      const requests = [];
      if (selectedLeague && league) {
        requests.push(fetch('/api/notifications/subscribe', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ category, league: String(league).toLowerCase() })
        }));
      }
      if (selectedSeries) {
        const keys = new Set(seriesSelection);
        const all = [];
        (series ? [series] : []).concat(Array.isArray(seriesList) ? seriesList : []).forEach((s) => {
          const id = s?.id || null;
          const slug = s?.series_id || s?.slug || null;
          const key = String(slug || id || '').trim();
          if (!key || !keys.has(key)) return;
          const body = { category };
          if (id) body.seriesId = id; if (slug) body.seriesSlug = slug;
          all.push(fetch('/api/notifications/subscribe', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
          }));
        });
        requests.push(...all);
      }
      if (selectedTeams.size > 0 && Array.isArray(teams)) {
        teams.forEach((t) => {
          const slug = String(t?.slug || '').toLowerCase();
          if (!slug || !selectedTeams.has(slug)) return;
          const body = { category };
          if (t.id) body.teamId = t.id; else body.teamSlug = slug;
          requests.push(fetch('/api/notifications/subscribe', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
          }));
        });
      }
      const resps = await Promise.all(requests);
      const allOk = resps.every((r) => r.ok);
      if (allOk) {
        try { onSubscribed && onSubscribed(); } catch {}
        onClose();
      }
    } catch (_) {
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded shadow-lg w-full max-w-md p-4">
        <h2 className="text-lg font-semibold">Subscribe</h2>
        <p className="mt-1 text-sm text-gray-700">Select what to subscribe to:</p>

        <div className="mt-3 space-y-2">
          {league ? (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={selectedLeague} onChange={(e) => setSelectedLeague(e.target.checked)} />
              <span>League: {String(league).toUpperCase()}</span>
            </label>
          ) : null}

          {Array.isArray(teams) && teams.length > 0 ? (
            <div>
              <div className="text-sm font-medium mb-1">Teams</div>
              <div className="space-y-1 max-h-40 overflow-auto pr-1">
                {teams.map((t) => (
                  <label key={t.slug || t.id} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={selectedTeams.has(String(t?.slug || '').toLowerCase())} onChange={() => toggleTeam(t?.slug)} />
                    <span>{t?.name || t?.slug}</span>
                  </label>
                ))}
              </div>
            </div>
          ) : null}

          {(series || (Array.isArray(seriesList) && seriesList.length > 0)) ? (
            <div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={selectedSeries} onChange={(e) => setSelectedSeries(e.target.checked)} />
                <span>Series</span>
              </label>
              {selectedSeries ? (
                <div className="mt-1 space-y-1 max-h-40 overflow-auto pr-1">
                  {([series].filter(Boolean)).concat(Array.isArray(seriesList) ? seriesList : []).map((s) => {
                    const id = s?.id || null;
                    const slug = s?.series_id || s?.slug || null;
                    const key = String(slug || id || 'unknown');
                    const label = s?.title || slug || id || 'Series';
                    return (
                      <label key={key} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={seriesSelection.has(key)}
                          onChange={() => {
                            setSeriesSelection((prev) => {
                              const next = new Set(prev);
                              if (next.has(key)) next.delete(key); else next.add(key);
                              return next;
                            });
                          }}
                        />
                        <span>{label}</span>
                      </label>
                    );
                  })}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="mt-4 flex items-center gap-2">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-3 py-2 rounded border text-sm"
          >
            Cancel
          </button>
          <button
            onClick={handleSubscribe}
            disabled={loading}
            className={`px-3 py-2 rounded text-white text-sm ${loading ? 'bg-gray-400' : 'bg-blue-600 hover:bg-blue-700'}`}
          >
            {loading ? 'Subscribing…' : 'Subscribe'}
          </button>
        </div>
      </div>
    </div>
  );
}


