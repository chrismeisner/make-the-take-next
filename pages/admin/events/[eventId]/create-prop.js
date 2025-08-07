import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useModal } from '../../../../contexts/ModalContext';

export default function CreateEventPropPage() {
  const router = useRouter();
  const { eventId } = router.query;
  const { openModal } = useModal();
  const [propShort, setPropShort] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [generatingSummary, setGeneratingSummary] = useState(false);
  const [propValueModel, setPropValueModel] = useState('vegas');
  const [propSummary, setPropSummary] = useState('');
  const [propSideAShort, setPropSideAShort] = useState('');
  const [propSideATake, setPropSideATake] = useState('');
  const [propSideAMoneyline, setPropSideAMoneyline] = useState('');
  const [propSideBShort, setPropSideBShort] = useState('');
  const [propSideBTake, setPropSideBTake] = useState('');
  const [propSideBMoneyline, setPropSideBMoneyline] = useState('');
  const propType = 'binary';
  const [event, setEvent] = useState(null);
  const [coverFile, setCoverFile] = useState(null);
  const [coverPreview, setCoverPreview] = useState(null);
  const [teamOptions, setTeamOptions] = useState([]);
  const [selectedTeams, setSelectedTeams] = useState([]);

  // Add propCloseTime state and formatting helper
  const [propCloseTime, setPropCloseTime] = useState('');
  const formatDateTimeLocal = (iso) => {
    const dt = new Date(iso);
    const pad = (n) => n.toString().padStart(2, '0');
    return `${dt.getFullYear()}-${pad(dt.getMonth()+1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
  };

  // Add propOpenTime state and default helper
  const [propOpenTime, setPropOpenTime] = useState('');
  const computeDefaultOpenTime = () => {
    const now = new Date();
    let date = new Date(now);
    if (now.getHours() < 12) {
      date.setHours(12, 0, 0, 0);
    } else if (now.getHours() < 18) {
      date.setHours(18, 0, 0, 0);
    } else {
      date.setDate(date.getDate() + 1);
      date.setHours(12, 0, 0, 0);
    }
    return formatDateTimeLocal(date.toISOString());
  };
  useEffect(() => {
    setPropOpenTime(computeDefaultOpenTime());
  }, []);

  useEffect(() => {
    if (!eventId) return;
    const fetchEvent = async () => {
      try {
        const res = await fetch(`/api/admin/events/${eventId}`);
        const data = await res.json();
        if (data.success) setEvent(data.event);
      } catch (err) {
        console.error('Error fetching event details:', err);
      }
    };
    fetchEvent();
  }, [eventId]);
  // Load teams for this event's league and initialize selected teams
  useEffect(() => {
    if (!event) return;
    (async () => {
      try {
        const res = await fetch('/api/teams');
        const data = await res.json();
        if (data.success) {
          const options = data.teams.filter(t => t.teamType === event.eventLeague);
          setTeamOptions(options);
          const initial = [];
          if (event.homeTeamLink) initial.push(...event.homeTeamLink);
          if (event.awayTeamLink) initial.push(...event.awayTeamLink);
          setSelectedTeams(initial);
        }
      } catch (err) {
        console.error('Error fetching teams:', err);
      }
    })();
  }, [event]);

  // Prefill propCloseTime when event loads
  useEffect(() => {
    if (event && event.eventTime) {
      setPropCloseTime(formatDateTimeLocal(event.eventTime));
    }
  }, [event]);

  // Handler to fetch moneyline odds and prefill form
  const handlePopulateMoneyline = async () => {
    console.log(`[Populate Moneyline] Button clicked, Airtable record ID=${eventId}`);
    if (!event) {
      console.warn('[Populate Moneyline] No event loaded; aborting');
      return;
    }
    const gameId = event.espnGameID;
    console.log(`[Populate Moneyline] Using espnGameID=${gameId} for API call`);
    if (!gameId) {
      console.error('[Populate Moneyline] espnGameID missing on event; aborting');
      setError('Missing espnGameID on event record');
      setLoading(false);
      return;
    }
    console.log('[Populate Moneyline] Setting loading state to true');
    setLoading(true);
    console.log('[Populate Moneyline] Clearing previous errors');
    setError(null);
    const leagueParam = `baseball/${event.eventLeague}`;
    console.log(`[Populate Moneyline] leagueParam=${leagueParam}`);
    const url = `/api/admin/vegas-odds?eventId=${gameId}&league=${encodeURIComponent(
      leagueParam
    )}&providerId=58`;
    console.log(`[Populate Moneyline] Fetching URL: ${url}`);
    try {
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      console.log(`[Populate Moneyline] Fetch response status=${res.status}`);
      if (!res.ok) {
        console.error(`[Populate Moneyline] Fetch failed with status=${res.status}`);
        throw new Error(`Error ${res.status}: ${res.statusText}`);
      }
      const data = await res.json();
      console.log('[Populate Moneyline] Received data:', data);
      // Use Airtable event fields for team names (unwrap arrays)
      const awayRaw = event.awayTeam;
      const homeRaw = event.homeTeam;
      const away = Array.isArray(awayRaw) ? awayRaw[0] : awayRaw || '';
      const home = Array.isArray(homeRaw) ? homeRaw[0] : homeRaw || '';
      console.log(
        `[Populate Moneyline] Mapping teams from Airtable: away="${away}", home="${home}"`
      );
      console.log(
        `[Populate Moneyline] Odds fetched: awayMoneyline=${data.awayTeamOdds.moneyLine}, homeMoneyline=${data.homeTeamOdds.moneyLine}`
      );
      // Prefill form fields
      console.log('[Populate Moneyline] Prefilling form fields with Airtable names and odds');
      setPropSideAShort(away);
      setPropSideBShort(home);
      const shortLabel = `Moneyline: ${away} vs ${home}`;
      const summaryText =
        `Moneyline odds for ${away} vs ${home}: ${away} ${data.awayTeamOdds.moneyLine}, ${home} ${data.homeTeamOdds.moneyLine}`;
      console.log(
        `[Populate Moneyline] Setting propShort="${shortLabel}", propSummary="${summaryText}"`
      );
      console.log(
        `[Populate Moneyline] About to set sideAMoneyline to ${data.awayTeamOdds.moneyLine} and sideBMoneyline to ${data.homeTeamOdds.moneyLine}`
      );
      // Populate moneyline fields (cast to string for input value)
      const mA = String(data.awayTeamOdds.moneyLine);
      const mB = String(data.homeTeamOdds.moneyLine);
      setPropSideAMoneyline(mA);
      console.log(`[Populate Moneyline] propSideAMoneyline state set to "${mA}"`);
      setPropSideBMoneyline(mB);
      console.log(`[Populate Moneyline] propSideBMoneyline state set to "${mB}"`);
      // Auto-populate 'take' fields
      const takeA = `${away} beat the ${home}`;
      const takeB = `${home} beat the ${away}`;
      console.log(
        `[Populate Moneyline] Setting sideATake="${takeA}", sideBTake="${takeB}"`
      );
      setPropSideATake(takeA);
      setPropSideBTake(takeB);
      setPropShort(shortLabel);
      // Removed setPropSummary(summaryText) so moneyline populate does not overwrite the summary
    } catch (err) {
      console.error('[Populate Moneyline] Error during fetch or processing:', err);
      setError(err.message);
    } finally {
      setLoading(false);
      console.log('[Populate Moneyline] Loading state set to false');
    }
  };

  // Handler to generate AI summary
  const handleGenerateSummary = async (context) => {
    if (!eventId) {
      setError('Missing eventId for summary generation');
      return;
    }
    setGeneratingSummary(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/generatePropSummary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId, context }),
      });
      const data = await res.json();
      if (data.success) {
        setPropSummary(data.summary);
      } else {
        setError(data.error || 'AI summary generation failed');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setGeneratingSummary(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!eventId) {
      setError('Missing eventId in query');
      return;
    }
    setLoading(true);
    setError(null);
    // Upload cover image if provided
    let propCoverUrl = null;
    if (coverFile) {
      const toBase64 = file => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = err => reject(err);
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
    try {
      const res = await fetch('/api/props', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          propShort,
          propSummary,
          PropSideAShort: propSideAShort,
          PropSideATake: propSideATake,
          PropSideAMoneyline: propSideAMoneyline,
          PropSideBShort: propSideBShort,
          PropSideBTake: propSideBTake,
          PropSideBMoneyline: propSideBMoneyline,
          propValueModel,
          propType,
          eventId,
          teams: selectedTeams,
          propOpenTime,
          propCloseTime,
          ...(propCoverUrl ? { propCover: propCoverUrl } : {}),
        }),
      });
      const data = await res.json();
      if (data.success) {
        router.push(`/admin/events/${eventId}`);
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 max-w-md mx-auto">
      {event ? (
        <div className="mb-4 p-4 bg-gray-100 rounded">
          <h2 className="text-xl font-semibold">{event.eventTitle}</h2>
          <p>Time: {new Date(event.eventTime).toLocaleString()}</p>
          <p>League: {event.eventLeague}</p>
        </div>
      ) : (
        <p className="mb-4">Loading event data...</p>
      )}
      {event && (
        <button
          type="button"
          onClick={handlePopulateMoneyline}
          className="mb-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Populate Moneyline Props
        </button>
      )}
      <h1 className="text-2xl font-bold mb-4">Create a Prop</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="propShort" className="block text-sm font-medium text-gray-700">
            Short Label
          </label>
          <input
            id="propShort"
            type="text"
            value={propShort}
            onChange={(e) => setPropShort(e.target.value)}
            className="mt-1 block w-full border rounded px-2 py-1"
          />
        </div>
        <div>
          <label htmlFor="propValueModel" className="block text-sm font-medium text-gray-700">Value Model</label>
          <select
            id="propValueModel"
            value={propValueModel}
            onChange={(e) => setPropValueModel(e.target.value)}
            className="mt-1 block w-full border rounded px-2 py-1"
          >
            <option value="vegas">Vegas</option>
            <option value="popular">Popular</option>
          </select>
        </div>
        <div>
          <label htmlFor="propSummary" className="block text-sm font-medium text-gray-700">Summary</label>
          <textarea
            id="propSummary"
            value={propSummary}
            onChange={(e) => setPropSummary(e.target.value)}
            className="mt-1 block w-full border rounded px-2 py-1"
          />
        </div>
        <div>
          <button
            type="button"
            onClick={() => {
              const away = Array.isArray(event.awayTeam) ? event.awayTeam[0] : event.awayTeam || '';
              const home = Array.isArray(event.homeTeam) ? event.homeTeam[0] : event.homeTeam || '';
              const defaultPrompt = `Search the web for the latest news and statistics around today's game between ${away} and ${home}. Write this in long paragraph format filled with stats and narratives.`;
              openModal('aiSummaryContext', { defaultPrompt, onGenerate: handleGenerateSummary });
            }}
            className="mt-1 text-sm bg-indigo-600 text-white rounded px-3 py-1 hover:bg-indigo-700"
          >
            Generate AI Summary
          </button>
        </div>
        {/* Open Time Field */}
        <div>
          <label htmlFor="propOpenTime" className="block text-sm font-medium text-gray-700">Open Time</label>
          <input
            id="propOpenTime"
            type="datetime-local"
            value={propOpenTime}
            onChange={(e) => setPropOpenTime(e.target.value)}
            className="mt-1 block w-full border rounded px-2 py-1"
          />
          <p
            className="text-sm text-blue-600 cursor-pointer"
            onClick={() => setPropOpenTime(computeDefaultOpenTime())}
          >
            Default Open Time
          </p>
        </div>
        <div>
          <label htmlFor="propCloseTime" className="block text-sm font-medium text-gray-700">
            Close Time
          </label>
          <input
            id="propCloseTime"
            type="datetime-local"
            value={propCloseTime}
            onChange={(e) => setPropCloseTime(e.target.value)}
            className="mt-1 block w-full border rounded px-2 py-1"
          />
          <p
            className="text-sm text-blue-600 cursor-pointer"
            onClick={() => setPropCloseTime(formatDateTimeLocal(event.eventTime))}
          >
            When event starts
          </p>
        </div>
        <h3 className="font-semibold">Side A</h3>
        <div>
          <label htmlFor="propSideAShort" className="block text-sm font-medium text-gray-700">Side A Label</label>
          <input
            id="propSideAShort"
            type="text"
            value={propSideAShort}
            onChange={(e) => setPropSideAShort(e.target.value)}
            className="mt-1 block w-full border rounded px-2 py-1"
          />
        </div>
        <div>
          <label htmlFor="propSideATake" className="block text-sm font-medium text-gray-700">Side A Take</label>
          <input
            id="propSideATake"
            type="text"
            value={propSideATake}
            onChange={(e) => setPropSideATake(e.target.value)}
            className="mt-1 block w-full border rounded px-2 py-1"
          />
        </div>
        {propValueModel === 'vegas' && (
          <div>
            <label htmlFor="propSideAMoneyline" className="block text-sm font-medium text-gray-700">Side A Moneyline</label>
            <input
              id="propSideAMoneyline"
              type="number"
              value={propSideAMoneyline}
              onChange={(e) => setPropSideAMoneyline(e.target.value)}
              className="mt-1 block w-full border rounded px-2 py-1"
            />
          </div>
        )}
        <h3 className="font-semibold">Side B</h3>
        <div>
          <label htmlFor="propSideBShort" className="block text-sm font-medium text-gray-700">Side B Label</label>
          <input
            id="propSideBShort"
            type="text"
            value={propSideBShort}
            onChange={(e) => setPropSideBShort(e.target.value)}
            className="mt-1 block w-full border rounded px-2 py-1"
          />
        </div>
        <div>
          <label htmlFor="propSideBTake" className="block text-sm font-medium text-gray-700">Side B Take</label>
          <input
            id="propSideBTake"
            type="text"
            value={propSideBTake}
            onChange={(e) => setPropSideBTake(e.target.value)}
            className="mt-1 block w-full border rounded px-2 py-1"
          />
        </div>
        {propValueModel === 'vegas' && (
          <div>
            <label htmlFor="propSideBMoneyline" className="block text-sm font-medium text-gray-700">Side B Moneyline</label>
            <input
              id="propSideBMoneyline"
              type="number"
              value={propSideBMoneyline}
              onChange={(e) => setPropSideBMoneyline(e.target.value)}
              className="mt-1 block w-full border rounded px-2 py-1"
            />
          </div>
        )}
        <div>
          <label htmlFor="propCover" className="block text-sm font-medium text-gray-700">Prop Cover (optional)</label>
          <input
            id="propCover"
            type="file"
            accept="image/*"
            onChange={(e) => {
              if (e.target.files.length) {
                setCoverFile(e.target.files[0]);
                setCoverPreview(URL.createObjectURL(e.target.files[0]));
              }
            }}
            className="mt-1 block w-full"
          />
          {coverPreview && (
            <img src={coverPreview} alt="Cover Preview" className="mt-2 h-32 object-contain" />
          )}
        </div>
        {/* Teams selection chips */}
        <div>
          <label className="block text-sm font-medium text-gray-700">Teams</label>
          <div className="mt-1 flex flex-wrap">
            {teamOptions.map(team => {
              const active = selectedTeams.includes(team.recordId);
              return (
                <button
                  key={team.recordId}
                  type="button"
                  onClick={() => {
                    if (active) setSelectedTeams(prev => prev.filter(id => id !== team.recordId));
                    else setSelectedTeams(prev => [...prev, team.recordId]);
                  }}
                  className={`inline-flex items-center px-3 py-1 mr-2 mb-2 text-sm font-medium rounded-full focus:outline-none ${
                    active
                      ? 'bg-blue-100 text-blue-800 border border-blue-300'
                      : 'bg-gray-200 text-gray-500 border border-gray-300'
                  }`}
                >
                  {team.teamName}
                </button>
              );
            })}
          </div>
        </div>
        {error && <p className="text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
        >
          {loading ? 'Creating...' : 'Create Prop'}
        </button>
      </form>
    </div>

  );
}