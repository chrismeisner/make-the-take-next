import React, { useState, useMemo, useEffect, useCallback } from "react";
import { useRouter } from "next/router";
import EventSelector from '../../components/EventSelector';

export default function CreatePackPage() {
  const [packTitle, setPackTitle] = useState("");
  const [packDetails, setPackDetails] = useState(null);
  const [step, setStep] = useState(1); // 1 = pack info, 2 = props builder
  const [selectedEvent, setSelectedEvent] = useState(null);
  useEffect(() => {
    console.log('selectedEvent changed:', selectedEvent);
  }, [selectedEvent]);
  // Live countdown timer for the selected event
  const [countdown, setCountdown] = useState('');
  useEffect(() => {
    if (!selectedEvent) {
      setCountdown('');
      return;
    }
    const updateCountdown = () => {
      const now = new Date();
      const eventTime = new Date(selectedEvent.eventTime);
      const diff = eventTime - now;
      if (diff <= 0) {
        setCountdown('Started');
        return;
      }
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);
      let str = '';
      if (days) str += `${days}d `;
      if (hours) str += `${hours}h `;
      if (minutes) str += `${minutes}m `;
      str += `${seconds}s`;
      setCountdown(str);
    };
    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [selectedEvent]);

  // Add timestamp suffix for slug uniqueness
  const [slugTimestamp] = useState(() => {
    const d = new Date();
    const yy = String(d.getFullYear()).slice(-2);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${yy}${mm}${dd}${hh}${min}`;
  });

  // First edit: add slugOverride state and randomize handler
  const [slugOverride, setSlugOverride] = useState("");
  const handleRandomize = () => {
    const rand = Math.random().toString(36).substring(2, 8);
    setSlugOverride(rand);
  };

  // Generate slug and append timestamp suffix
  const slug = useMemo(() => {
    if (slugOverride) return slugOverride;
    const base = packTitle
      .replace(/ /g, "-")
      .replace(/\//g, "-")
      .replace(/&/g, "-")
      .replace(/[–—]/g, "-")
      .replace(/\|/g, "-")
      .replace(/,/g, "")
      .replace(/:/g, "")
      .toLowerCase();
    return base ? `${base}-${slugTimestamp}` : "";
  }, [packTitle, slugTimestamp, slugOverride]);
  const [packSummary, setPackSummary] = useState("");
  const [packLeague, setPackLeague] = useState("");
  const [leagueOptions, setLeagueOptions] = useState([]);
  useEffect(() => {
    fetch("/api/admin/leagues")
      .then(res => res.json())
      .then(data => {
        if (data.success) setLeagueOptions(data.leagues);
      })
      .catch(err => console.error("Failed to load leagues", err));
  }, []);
  // Options: 'event' or 'content'
  const [packType, setPackType] = useState("event");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const router = useRouter();
  // Add handler to redirect to Super Prop flow
  const handlePackTypeChange = (e) => {
    const newType = e.target.value;
    if (newType === 'superprop') {
      const queryParts = [];
      if (packLeague) queryParts.push(`packLeague=${encodeURIComponent(packLeague)}`);
      if (packTitle) queryParts.push(`packTitle=${encodeURIComponent(packTitle)}`);
      if (selectedEvent) {
        queryParts.push(`eventId=${encodeURIComponent(selectedEvent.id)}`);
        queryParts.push(`eventTitle=${encodeURIComponent(selectedEvent.eventTitle)}`);
        queryParts.push(`eventTime=${encodeURIComponent(selectedEvent.eventTime)}`);
        queryParts.push(`eventLeague=${encodeURIComponent(selectedEvent.eventLeague)}`);
      }
      const qs = queryParts.length ? `?${queryParts.join('&')}` : '';
      router.push(`/admin/create-super-prop${qs}`);
    } else {
      setPackType(newType);
    }
  };
  const { packId: initialPackId, packType: initialPackType } = router.query;
  // If loaded from a ?packType query param, default to that type
  useEffect(() => {
    if (initialPackType) {
      setPackType(initialPackType);
    }
  }, [initialPackType]);
  const [packRecordId, setPackRecordId] = useState(initialPackId || null);
  const [packProps, setPackProps] = useState([]);
  // Assign a localId to each prop and buffer new ones until publish
  const [nextLocalId, setNextLocalId] = useState(1);
  // Function to move a prop up or down in the packProps list (local only)
  const moveProp = (localId, direction) => {
    setPackProps(prev => {
      const idx = prev.findIndex(p => p.localId === localId);
      const newIndex = idx + direction;
      if (idx < 0 || newIndex < 0 || newIndex >= prev.length) return prev;
      const arr = [...prev];
      [arr[idx], arr[newIndex]] = [arr[newIndex], arr[idx]];
      return arr.map((p, i) => ({ ...p, propOrder: i }));
    });
  };
  const [loadingPackProps, setLoadingPackProps] = useState(false);
  const [propsError, setPropsError] = useState(null);
  const [newPropShort, setNewPropShort] = useState("");
  const [newPropSummary, setNewPropSummary] = useState("");
  const [newPropSideAShort, setNewPropSideAShort] = useState("");
  const [newPropSideBShort, setNewPropSideBShort] = useState("");
  // Add new state hooks for Side A and Side B takes
  const [newPropSideATake, setNewPropSideATake] = useState("");
  const [newPropSideBTake, setNewPropSideBTake] = useState("");
  // Add prop value model and moneyline states
  const [newPropValueModel, setNewPropValueModel] = useState("popular");
  const [newPropSideAMoneyline, setNewPropSideAMoneyline] = useState("");
  const [newPropSideBMoneyline, setNewPropSideBMoneyline] = useState("");
  const [newPropType, setNewPropType] = useState("fact");
  const teamOptions = useMemo(() => {
    if (!selectedEvent) return [];
    return [
      ...(selectedEvent.homeTeamLink || []).map(id => ({
        id,
        name: selectedEvent.homeTeam,
        logo: selectedEvent.homeTeamLogo,
      })),
      ...(selectedEvent.awayTeamLink || []).map(id => ({
        id,
        name: selectedEvent.awayTeam,
        logo: selectedEvent.awayTeamLogo,
      })),
    ];
  }, [selectedEvent]);
  // Derive the default set of team IDs for this pack
  const packTeams = useMemo(() => {
    if (!selectedEvent) return [];
    return [
      ...(selectedEvent.homeTeamLink || []),
      ...(selectedEvent.awayTeamLink || []),
    ];
  }, [selectedEvent]);
  // State to track which teams are selected for a new prop
  const [newPropTeams, setNewPropTeams] = useState([]);
  // Whenever the pack's teams change, reset the selection for new props
  useEffect(() => {
    setNewPropTeams(packTeams);
  }, [packTeams]);
  // State for selecting teams in new prop
  // Removed newPropTeams state

  // Log teams when entering the props builder (step 2)
  // Removed useEffect for logging teams

  // Initialize default teams when event changes
  // Removed useEffect for initializing teams
  // Track which prop is being edited (Airtable ID)
  const [editingPropId, setEditingPropId] = useState(null);
  const [loadingPropCreate, setLoadingPropCreate] = useState(false);
  const [coverFile, setCoverFile] = useState(null);
  const [coverPreview, setCoverPreview] = useState(null);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Handle cover file selection
  const handleCoverChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setCoverFile(file);
      const reader = new FileReader();
      reader.onload = () => setCoverPreview(reader.result);
      reader.readAsDataURL(file);
    } else {
      setCoverFile(null);
      setCoverPreview(null);
    }
  };
  // EventSelector handles its own modal; removed inline modal code
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    // Upload cover image first, if provided
    let packCoverUrl;
    if (coverFile) {
      const base64Data = coverPreview.split(",")[1];
      try {
        const uploadRes = await fetch("/api/admin/uploadPackCover", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filename: coverFile.name, fileData: base64Data }),
        });
        const uploadData = await uploadRes.json();
        if (uploadData.success) {
          packCoverUrl = uploadData.url;
        } else {
          throw new Error(uploadData.error || "Upload failed");
        }
      } catch (err) {
        setError("Cover upload failed: " + err.message);
        setLoading(false);
        return;
      }
    }
    try {
      // Build teams array from selectedEvent (Airtable record IDs)
      const teams = selectedEvent
        ? [...(selectedEvent.homeTeamLink || []), ...(selectedEvent.awayTeamLink || [])]
        : [];
      const res = await fetch("/api/packs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          packTitle,
          packURL: slug,
          packSummary,
          packType,
          packLeague,
          // Include full event object for server-side upsert
          event: selectedEvent,
          teams,
          packCoverUrl,
        }),
      });
      const data = await res.json();
      if (data.success) {
        // Store created pack details and advance to props builder
        setPackDetails(data.record.fields);
        setPackRecordId(data.record.id);
        // Log teams when clicking Next: Create Props
        console.log('Next clicked - available teams for props:', teamOptions);
        console.log('Next clicked - selected teams (newPropTeams):', []); // Removed newPropTeams
        setStep(2);
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };
  
  // Fetch linked props when we have a packRecordId
  const fetchPackProps = useCallback(async () => {
    console.log('fetchPackProps: packRecordId =', packRecordId);
    setLoadingPackProps(true);
    setPropsError(null);
    try {
      const res = await fetch(`/api/props?limit=100`);
      const data = await res.json();
      console.log('fetchPackProps: data.props =', data.props);
      if (data.success) {
        const filtered = data.props.filter((p) => p.linkedPacks.includes(packRecordId));
        console.log('fetchPackProps: filtered props =', filtered);
        filtered.sort((a, b) => (a.propOrder || 0) - (b.propOrder || 0));
        // Map Airtable props to include a localId for editing
        setPackProps(filtered.map(p => ({ ...p, localId: p.airtableId })));
      } else {
        setPropsError(data.error);
      }
    } catch (err) {
      setPropsError(err.message);
    } finally {
      setLoadingPackProps(false);
    }
  }, [packRecordId]);

  // Initial fetch when packRecordId is set
  useEffect(() => {
    if (packRecordId) fetchPackProps();
  }, [packRecordId, fetchPackProps]);

  // Inline handler to create a new prop (local only)
  const handleCreateProp = (e) => {
    e.preventDefault();
    const newProp = {
      localId: `local-${nextLocalId}`,
      airtableId: null,
      propShort: newPropShort,
      propSummary: newPropSummary,
      PropSideAShort: newPropSideAShort,
      PropSideBShort: newPropSideBShort,
      PropSideATake: newPropSideATake,
      PropSideBTake: newPropSideBTake,
      propType: newPropType,
      propStatus: 'open',
      propOrder: packProps.length,
      teams: newPropTeams,
      propValueModel: newPropValueModel,
      PropSideAMoneyline: newPropSideAMoneyline,
      PropSideBMoneyline: newPropSideBMoneyline,
    };
    setPackProps(prev => [...prev, newProp]);
    setNextLocalId(prev => prev + 1);
    setNewPropShort('');
    setNewPropSummary('');
    setNewPropSideAShort('');
    setNewPropSideBShort('');
    setNewPropType('fact');
    // Clear new take fields
    setNewPropSideATake('');
    setNewPropSideBTake('');
    // Reset prop value model and moneylines
    setNewPropValueModel('popular');
    setNewPropSideAMoneyline('');
    setNewPropSideBMoneyline('');
    // Reset team selection for next prop
    setNewPropTeams(packTeams);
  };
  // Inline handler to update an existing prop (local only)
  const handleUpdateProp = (e) => {
    e.preventDefault();
    if (!editingPropId) return;
    setPackProps(prev =>
      prev.map(p =>
        p.localId === editingPropId
          ? { ...p,
              propShort: newPropShort,
              propSummary: newPropSummary,
              PropSideAShort: newPropSideAShort,
              PropSideBShort: newPropSideBShort,
              PropSideATake: newPropSideATake,
              PropSideBTake: newPropSideBTake,
              propType: newPropType,
              propValueModel: newPropValueModel,
              PropSideAMoneyline: newPropSideAMoneyline,
              PropSideBMoneyline: newPropSideBMoneyline,
            }
          : p
      )
    );
    setEditingPropId(null);
    setNewPropShort('');
    setNewPropSummary('');
    setNewPropSideAShort('');
    setNewPropSideBShort('');
    setNewPropType('fact');
    // Clear take fields
    setNewPropSideATake('');
    setNewPropSideBTake('');
    // Reset prop value model and moneylines
    setNewPropValueModel('popular');
    setNewPropSideAMoneyline('');
    setNewPropSideBMoneyline('');
  };

  // Cancel confirm handler
  const handleCancelConfirm = async () => {
    setDeleting(true);
    try {
      await fetch('/api/admin/deletePack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packId: packRecordId, propIds: packProps.map(p => p.airtableId) }),
      });
    } catch (err) {
      console.error(err);
    } finally {
      router.push('/admin');
    }
  };
  // Batch persist all props and then finalize pack
  const [savingAll, setSavingAll] = useState(false);
  const handlePublish = async () => {
    console.log('Publish clicked for packRecordId:', packRecordId);
    console.log('Props to publish:', packProps);
    setSavingAll(true);
    try {
      for (const p of packProps) {
        if (!p.airtableId) {
          const payload = {
            propShort: p.propShort,
            propSummary: p.propSummary,
            PropSideAShort: p.PropSideAShort,
            PropSideBShort: p.PropSideBShort,
            PropSideATake: p.PropSideATake,
            PropSideBTake: p.PropSideBTake,
            propType: p.propType,
            propStatus: p.propStatus,
            packId: packRecordId,
            propOrder: p.propOrder,
            teams: p.teams,
            propValueModel: p.propValueModel,
            ...(p.PropSideAMoneyline ? { PropSideAMoneyline: p.PropSideAMoneyline } : {}),
            ...(p.PropSideBMoneyline ? { PropSideBMoneyline: p.PropSideBMoneyline } : {}),
          };
          console.log('handlePublish - creating prop with payload:', payload);
          const res = await fetch('/api/props', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          const data = await res.json();
          if (!data.success) throw new Error(data.error);
        } else {
          const payload = {
            propId: p.airtableId,
            propShort: p.propShort,
            propSummary: p.propSummary,
            PropSideAShort: p.PropSideAShort,
            PropSideBShort: p.PropSideBShort,
            PropSideATake: p.PropSideATake,
            PropSideBTake: p.PropSideBTake,
            propType: p.propType,
            propStatus: p.propStatus,
            propOrder: p.propOrder,
            teams: p.teams,
            propValueModel: p.propValueModel,
            ...(p.PropSideAMoneyline !== undefined ? { PropSideAMoneyline: p.PropSideAMoneyline } : {}),
            ...(p.PropSideBMoneyline !== undefined ? { PropSideBMoneyline: p.PropSideBMoneyline } : {}),
          };
          console.log('handlePublish - updating prop with payload:', payload);
          const res = await fetch('/api/props', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          const data = await res.json();
          if (!data.success) throw new Error(data.error);
        }
      }
      const packPayload = { packId: packRecordId, packStatus: 'active' };
      console.log('handlePublish - updating pack status with payload:', packPayload);
      await fetch('/api/packs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(packPayload),
      });
      router.push('/admin');
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingAll(false);
    }
  };
  const handleSaveDraft = async () => {
    setSavingAll(true);
    try {
      for (const p of packProps) {
        if (!p.airtableId) {
          const res = await fetch('/api/props', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              propShort: p.propShort,
              propSummary: p.propSummary,
              PropSideAShort: p.PropSideAShort,
              PropSideBShort: p.PropSideBShort,
              PropSideATake: p.PropSideATake,
              PropSideBTake: p.PropSideBTake,
              propType: p.propType,
              propValueModel: p.propValueModel,
              PropSideAMoneyline: p.PropSideAMoneyline,
              PropSideBMoneyline: p.PropSideBMoneyline,
              propStatus: p.propStatus,
              packId: packRecordId,
              propOrder: p.propOrder,
              teams: p.teams
            }),
          });
          const data = await res.json();
          if (!data.success) throw new Error(data.error);
        } else {
          const res = await fetch('/api/props', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              propId: p.airtableId,
              propShort: p.propShort,
              propSummary: p.propSummary,
              PropSideAShort: p.PropSideAShort,
              PropSideBShort: p.PropSideBShort,
              PropSideATake: p.PropSideATake,
              PropSideBTake: p.PropSideBTake,
              propType: p.propType,
              propValueModel: p.propValueModel,
              PropSideAMoneyline: p.PropSideAMoneyline,
              PropSideBMoneyline: p.PropSideBMoneyline,
              propStatus: p.propStatus,
              propOrder: p.propOrder,
              teams: p.teams,
            }),
          });
          const data = await res.json();
          if (!data.success) throw new Error(data.error);
        }
      }
      await fetch('/api/packs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packId: packRecordId, packStatus: 'draft' }),
      });
      router.push('/admin');
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingAll(false);
    }
  };
   
  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">Create a Pack (v0.1)</h1>
      {/* Step 1: Pack Info */}
      {step === 1 && (
        <div className="max-w-lg mx-auto">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="packLeague" className="block text-sm font-medium text-gray-700">League</label>
              <select
                id="packLeague"
                value={packLeague}
                onChange={(e) => setPackLeague(e.target.value)}
                className="mt-1 block w-full border rounded px-2 py-1"
                required
              >
                <option value="">-- Select League --</option>
                {leagueOptions.map((lg) => (
                  <option key={lg} value={lg}>
                    {lg.toUpperCase()}
                  </option>
                ))}
              </select>
            </div>
          {/* Type selection at top */}
          <div>
            <label htmlFor="packType" className="block text-sm font-medium text-gray-700">Type</label>
            <select
              id="packType"
              value={packType}
              onChange={handlePackTypeChange}
              className="mt-1 block w-full border rounded px-2 py-1"
              required
            >
              <option value="event">Event</option>
              <option value="content">Content</option>
              <option value="vegas">Vegas</option>
              <option value="superprop">Super Prop</option>
            </select>
          </div>
          {packType === "event" && (
            <div>
              <label htmlFor="event" className="block text-sm font-medium text-gray-700">Event</label>
              <EventSelector
                selectedEvent={selectedEvent}
                onSelect={(evt) => {
                  setSelectedEvent(evt);
                  setPackTitle(evt.eventTitle);
                }}
                league={packLeague}
              />
              {selectedEvent && (
                <>
                  <p className="mt-2 text-sm text-gray-700">
                    Selected: {selectedEvent.eventTitle} — {new Date(selectedEvent.eventTime).toLocaleString()}
                  </p>
                  <div className="flex items-center space-x-2 mt-2">
                    {selectedEvent.awayTeamLogo && (
                      <img src={selectedEvent.awayTeamLogo} alt={selectedEvent.awayTeam} className="w-8 h-8 object-contain" />
                    )}
                    {selectedEvent.homeTeamLogo && (
                      <img src={selectedEvent.homeTeamLogo} alt={selectedEvent.homeTeam} className="w-8 h-8 object-contain" />
                    )}
                  </div>
                  {countdown && (
                    <p className="mt-2 text-sm text-gray-700">Starts in: {countdown}</p>
                  )}
                  {selectedEvent && selectedEvent.espnLink && (
                    <p className="mt-2">
                      <a
                        href={selectedEvent.espnLink.startsWith("http")
                          ? selectedEvent.espnLink
                          : `https://espn.com/mlb/boxscore/_/gameId/${selectedEvent.espnLink}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 underline"
                      >
                        View on ESPN
                      </a>
                    </p>
                  )}
                  <p className="mt-2">
                    <button
                      type="button"
                      onClick={() => setSelectedEvent(null)}
                      className="text-sm text-red-600 underline"
                    >
                      Remove event
                    </button>
                  </p>
                </>
              )}
            </div>
          )}
          {packType === "vegas" && (
            <div>
              <label htmlFor="event" className="block text-sm font-medium text-gray-700">Event (optional)</label>
              <EventSelector
                selectedEvent={selectedEvent}
                onSelect={(evt) => {
                  setSelectedEvent(evt);
                }}
                league={packLeague}
              />
              {selectedEvent && (
                <p className="mt-2 text-sm text-gray-700">
                  Selected: {selectedEvent.eventTitle} — {new Date(selectedEvent.eventTime).toLocaleString()}
                </p>
              )}
            </div>
          )}
          <div>
            <label htmlFor="packTitle" className="block text-sm font-medium text-gray-700">Title</label>
            <input
              id="packTitle"
              type="text"
              value={packTitle}
              onChange={(e) => setPackTitle(e.target.value)}
              className="mt-1 block w-full border rounded px-2 py-1"
              required
            />
            <p className="text-sm text-gray-500 mt-1">Slug preview: {slug || "(none)"}</p>
            {/* Third edit: add randomize link below preview */}
            <p className="text-sm mt-1">
              <button type="button" onClick={handleRandomize} className="text-sm text-blue-600 underline">
                randomize
              </button>
            </p>
          </div>
          <div>
            <label htmlFor="packSummary" className="block text-sm font-medium text-gray-700">Summary</label>
            <textarea
              id="packSummary"
              value={packSummary}
              onChange={(e) => setPackSummary(e.target.value)}
              className="mt-1 block w-full border rounded px-2 py-1"
            />
          </div>
          <div>
            <label htmlFor="packCover" className="block text-sm font-medium text-gray-700">Cover Image</label>
            <input
              id="packCover"
              type="file"
              accept="image/*"
              onChange={handleCoverChange}
              className="mt-1 block w-full"
            />
            {coverPreview && (
              <>
                <img src={coverPreview} alt="Cover preview" className="mt-2 max-h-40 object-contain" />
                <p className="mt-1">
                  <button
                    type="button"
                    onClick={() => { setCoverFile(null); setCoverPreview(null); }}
                    className="text-sm text-red-600 underline"
                  >
                    Remove cover image
                  </button>
                </p>
              </>
            )}
          </div>
          {error && <p className="text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={loading || !packTitle || (packType === "event" && !selectedEvent)}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? "Saving..." : "Next: Create Props"}
          </button>
        </form>
        </div>
      )}
      {/* EventSelector handles its own modal; removed inline modal code */}

      {/* Step 2: Props Builder */}
      {step === 2 && packRecordId && (
        <div className="mt-8 container mx-auto">
          <div className="mb-4">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="text-sm text-blue-600 underline"
            >
              ← Edit Pack Details
            </button>
          </div>
          {/* Display pack details */}
          {packDetails && (
            <div className="mb-6 p-4 border rounded bg-gray-50">
              <h2 className="text-lg font-semibold mb-2">Pack Details</h2>
              <p><strong>Title:</strong> {packDetails.packTitle}</p>
              <p><strong>Summary:</strong> {packDetails.packSummary}</p>
              <p><strong>Type:</strong> {packDetails.packType}</p>
              <p><strong>League:</strong> {packDetails.packLeague}</p>
              {(packDetails.packType === 'event' || packDetails.packType === 'vegas') && selectedEvent && (
                <p><strong>Event:</strong> {selectedEvent.eventTitle} — {new Date(selectedEvent.eventTime).toLocaleString()}</p>
              )}
              {teamOptions.length > 0 && (
                <p><strong>Teams:</strong> {teamOptions.map(team => team.name).join(', ')}</p>
              )}
              {packDetails.packCover?.[0]?.url && (
                <img src={packDetails.packCover[0].url} alt="Pack Cover" className="mt-2 max-h-40 object-contain" />
              )}
            </div>
          )}
          <h2 className="text-xl font-bold mb-4">Props</h2>
          <button
            type="button"
            onClick={fetchPackProps}
            className="mb-4 px-3 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
          >
            Refresh
          </button>
          {/* Dynamic props table */}
          <div className={`transition-opacity duration-200 ${loadingPackProps ? 'opacity-50' : 'opacity-100'}`}>
            {console.log('rendering packProps in table:', packProps)}
            {console.log('rendering selectedEvent in table:', selectedEvent)}
            <table className="min-w-full divide-y divide-gray-200 mb-6">
              <thead>
                <tr>
                  <th className="px-4 py-2"></th>
                  <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Order</th>
                  <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Short Label</th>
                  <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Summary</th>
                  <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Side 1</th>
                  <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Side 2</th>
                  <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Side A Take</th>
                  <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Side B Take</th>
                  <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Teams</th>
                  <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Status</th>
                  <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Edit</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {packProps.map((p, idx) => (
                  <tr key={p.localId}>
                    <td className="px-4 py-2">
                      <button
                        className="mr-2 text-sm text-gray-600 disabled:opacity-50"
                        disabled={loadingPackProps || idx === 0}
                        onClick={() => moveProp(p.localId, -1)}
                      >
                        ↑
                      </button>
                      <button
                        className="text-sm text-gray-600 disabled:opacity-50"
                        disabled={loadingPackProps || idx === packProps.length - 1}
                        onClick={() => moveProp(p.localId, 1)}
                      >
                        ↓
                      </button>
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-900">{idx + 1}</td>
                    <td className="px-4 py-2 text-sm text-gray-900">{p.propShort}</td>
                    <td className="px-4 py-2 text-sm text-gray-900">{p.propSummary}</td>
                    <td className="px-4 py-2 text-sm text-gray-900">{p.PropSideAShort}</td>
                    <td className="px-4 py-2 text-sm text-gray-900">{p.PropSideBShort}</td>
                    <td className="px-4 py-2 text-sm text-gray-900">{p.PropSideATake}</td>
                    <td className="px-4 py-2 text-sm text-gray-900">{p.PropSideBTake}</td>
                    <td className="px-4 py-2">
                      {teamOptions.filter(team => p.teams.includes(team.id)).map(team => (
                        <span key={team.id} className="inline-block bg-gray-100 text-gray-800 px-2 py-1 mr-1 rounded text-xs">
                          {team.name}
                        </span>
                      ))}
                    </td>
                    {/* Status toggle column */}
                    <td className="px-4 py-2">
                      <button
                        type="button"
                        onClick={() =>
                          setPackProps(prev =>
                            prev.map(item =>
                              item.localId === p.localId
                                ? { ...item, propStatus: item.propStatus === 'open' ? 'draft' : 'open' }
                                : item
                            )
                          )
                        }
                        className={`px-3 py-1 rounded ${p.propStatus === 'open' ? 'bg-green-600 text-white' : 'bg-gray-300 text-gray-700'}`}
                      >
                        {p.propStatus === 'open' ? 'Open' : 'Draft'}
                      </button>
                    </td>
                    <td className="px-4 py-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingPropId(p.localId);
                          setNewPropShort(p.propShort);
                          setNewPropSummary(p.propSummary);
                          setNewPropSideAShort(p.PropSideAShort);
                          setNewPropSideBShort(p.PropSideBShort);
                          setNewPropType(p.propType);
                          setNewPropSideATake(p.PropSideATake);
                          setNewPropSideBTake(p.PropSideBTake);
                          // Pre-populate team selection
                          setNewPropTeams(p.teams || []);
                          setNewPropValueModel(p.propValueModel || 'popular');
                          setNewPropSideAMoneyline(p.PropSideAMoneyline || '');
                          setNewPropSideBMoneyline(p.PropSideBMoneyline || '');
                        }}
                        className="text-blue-600 underline"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Inline new Prop form */}
          <form onSubmit={handleCreateProp} className="space-y-4">
            {/* Teams selection chips */}
            <div>
              <label className="block text-sm font-medium text-gray-700">Teams</label>
              <div className="mt-1 flex flex-wrap">
                {teamOptions.map((team) => {
                  const active = newPropTeams.includes(team.id);
                  return (
                    <button
                      key={team.id}
                      type="button"
                      onClick={() => {
                        if (active) {
                          setNewPropTeams(prev => prev.filter(id => id !== team.id));
                        } else {
                          setNewPropTeams(prev => [...prev, team.id]);
                        }
                      }}
                      className={`inline-flex items-center px-3 py-1 mr-2 mb-2 text-sm font-medium rounded-full focus:outline-none ${
                        active
                          ? 'bg-blue-100 text-blue-800 border border-blue-300'
                          : 'bg-gray-200 text-gray-500 border border-gray-300'
                      }`}
                    >
                      {team.name}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <label htmlFor="newPropShort" className="block text-sm font-medium text-gray-700">New Prop Short Label</label>
              <input
                id="newPropShort"
                type="text"
                value={newPropShort}
                onChange={(e) => setNewPropShort(e.target.value)}
                className="mt-1 block w-full border rounded px-2 py-1"
              />
            </div>
            <div>
              <label htmlFor="newPropSummary" className="block text-sm font-medium text-gray-700">Summary</label>
              <textarea
                id="newPropSummary"
                value={newPropSummary}
                onChange={(e) => setNewPropSummary(e.target.value)}
                className="mt-1 block w-full border rounded px-2 py-1"
              />
            </div>
            <div>
              <label htmlFor="newPropSideAShort" className="block text-sm font-medium text-gray-700">Side A Label</label>
              <input
                id="newPropSideAShort"
                type="text"
                value={newPropSideAShort}
                onChange={(e) => setNewPropSideAShort(e.target.value)}
                className="mt-1 block w-full border rounded px-2 py-1"
              />
            </div>
            <div>
              <label htmlFor="newPropSideBShort" className="block text-sm font-medium text-gray-700">Side B Label</label>
              <input
                id="newPropSideBShort"
                type="text"
                value={newPropSideBShort}
                onChange={(e) => setNewPropSideBShort(e.target.value)}
                className="mt-1 block w-full border rounded px-2 py-1"
              />
            </div>
            {/* Add take inputs */}
            <div>
              <label htmlFor="newPropSideATake" className="block text-sm font-medium text-gray-700">Side A Take</label>
              <input
                id="newPropSideATake"
                type="text"
                value={newPropSideATake}
                onChange={(e) => setNewPropSideATake(e.target.value)}
                className="mt-1 block w-full border rounded px-2 py-1"
              />
            </div>
            <div>
              <label htmlFor="newPropSideBTake" className="block text-sm font-medium text-gray-700">Side B Take</label>
              <input
                id="newPropSideBTake"
                type="text"
                value={newPropSideBTake}
                onChange={(e) => setNewPropSideBTake(e.target.value)}
                className="mt-1 block w-full border rounded px-2 py-1"
              />
            </div>
            <div>
              <label htmlFor="newPropValueModel" className="block text-sm font-medium text-gray-700">Value Model</label>
              <select
                id="newPropValueModel"
                value={newPropValueModel}
                onChange={(e) => setNewPropValueModel(e.target.value)}
                className="mt-1 block w-full border rounded px-2 py-1"
              >
                <option value="popular">Popular Value</option>
                <option value="vegas">Vegas Mode</option>
              </select>
            </div>
            {newPropValueModel === "vegas" && (
              <>
                <div>
                  <label htmlFor="newPropSideAMoneyline" className="block text-sm font-medium text-gray-700">Side A Moneyline</label>
                  <input
                    id="newPropSideAMoneyline"
                    type="number"
                    value={newPropSideAMoneyline}
                    onChange={(e) => setNewPropSideAMoneyline(e.target.value)}
                    className="mt-1 block w-full border rounded px-2 py-1"
                  />
                </div>
                <div>
                  <label htmlFor="newPropSideBMoneyline" className="block text-sm font-medium text-gray-700">Side B Moneyline</label>
                  <input
                    id="newPropSideBMoneyline"
                    type="number"
                    value={newPropSideBMoneyline}
                    onChange={(e) => setNewPropSideBMoneyline(e.target.value)}
                    className="mt-1 block w-full border rounded px-2 py-1"
                  />
                </div>
              </>
            )}
            <div>
              <label htmlFor="newPropType" className="block text-sm font-medium text-gray-700">Type</label>
              <select
                id="newPropType"
                value={newPropType}
                onChange={(e) => setNewPropType(e.target.value)}
                className="mt-1 block w-full border rounded px-2 py-1"
              >
                <option value="fact">Fact</option>
                <option value="opinion">Opinion</option>
              </select>
            </div>
            {propsError && <p className="text-red-600">{propsError}</p>}
            <div className="flex space-x-2">
              <button
                type="submit"
                disabled={loadingPropCreate}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              >
                {loadingPropCreate ? "Adding..." : "Add Prop"}
              </button>
              <button
                type="button"
                onClick={handleUpdateProp}
                disabled={!editingPropId || loadingPropCreate}
                className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
              >
                {loadingPropCreate && editingPropId ? "Updating..." : "Update Prop"}
              </button>
            </div>
          </form>
          {/* Action buttons: Publish, Save Draft & Cancel */}
          <div className="mt-6 flex space-x-4">
            <button
              type="button"
              onClick={handlePublish}
              disabled={savingAll}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
            >
              {savingAll ? 'Publishing...' : 'Publish'}
            </button>
            <button
              type="button"
              onClick={handleSaveDraft}
              disabled={savingAll}
              className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 disabled:opacity-50"
            >
              {savingAll ? 'Saving...' : 'Save Draft'}
            </button>
            <button
              type="button"
              onClick={() => setCancelModalOpen(true)}
              className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {/* Cancel Confirmation Modal */}
      {step === 2 && cancelModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded max-w-md w-full text-center">
            <h2 className="text-xl font-bold mb-4">Confirm Cancel</h2>
            <p>This will delete your new pack and all its props and return to the Admin dashboard. Continue?</p>
            <div className="mt-6 flex justify-center space-x-4">
              <button
                onClick={() => setCancelModalOpen(false)}
                disabled={deleting}
                className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
              >
                No
              </button>
              <button
                onClick={handleCancelConfirm}
                disabled={deleting}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
              >
                {deleting ? 'Deleting...' : 'Yes, Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step 3: Preview & Publish (disabled) */}
      {false && (
        <div className="mt-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            {/* Left: Pack details */}
            <div className="p-4 border rounded bg-gray-50">
              <h2 className="text-lg font-semibold mb-2">Pack Details</h2>
              <p><strong>Title:</strong> {packDetails.packTitle}</p>
              <p><strong>Summary:</strong> {packDetails.packSummary}</p>
              <p><strong>Type:</strong> {packDetails.packType}</p>
              <p><strong>League:</strong> {packDetails.packLeague}</p>
              {(packDetails.packType === 'event' || packDetails.packType === 'vegas') && (
                <p><strong>Event:</strong> {selectedEvent.eventTitle}</p>
              )}
            </div>
            {/* Right: Props stack */}
            <div className="p-4 border rounded bg-white max-h-[400px] overflow-y-auto">
              <h2 className="text-lg font-semibold mb-2">Props Preview</h2>
              {packProps.map((p) => (
                <div key={p.airtableId} className="mb-3 p-2 border rounded">
                  <p className="font-semibold">{p.propShort}</p>
                  <p className="text-sm text-gray-600">{p.propSummary}</p>
                  <p className="text-sm">A: {p.PropSideAShort} | B: {p.PropSideBShort}</p>
                </div>
              ))}
            </div>
          </div>
          {/* Action Buttons */}
          <div className="flex space-x-4">
            <button
              onClick={async () => {
                // Publish: set all props to open
                for (const p of packProps) {
                  await fetch('/api/props', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ propId: p.airtableId, propStatus: 'open' }),
                  });
                }
                // Update packStatus to Active
                await fetch('/api/packs', {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ packId: packRecordId, packStatus: 'Active' }),
                });
                router.push('/admin');
              }}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
            >
              Publish
            </button>
            <button
              onClick={() => router.push('/admin')}
              className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
            >
              Save Draft
            </button>
            <button
              onClick={async () => {
                // Archive: set all props to archived
                for (const p of packProps) {
                  await fetch('/api/props', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ propId: p.airtableId, propStatus: 'archived' }),
                  });
                }
                router.push('/admin');
              }}
              className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
            >
              Archive
            </button>
          </div>
        </div>
      )}
    </div>
  );
} 