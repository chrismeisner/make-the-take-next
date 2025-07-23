import React, { useState, useMemo, useEffect, useCallback } from "react";
import { useRouter } from "next/router";

export default function CreatePackPage() {
  const [packTitle, setPackTitle] = useState("");
  const [packDetails, setPackDetails] = useState(null);
  const [step, setStep] = useState(1); // 1 = pack info, 2 = props builder
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [eventModalOpen, setEventModalOpen] = useState(false);
  const [events, setEvents] = useState([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [eventsError, setEventsError] = useState(null);
  const [sortOrder, setSortOrder] = useState("asc"); // 'asc' for soonest first, 'desc' for latest first
  // Date filter for events modal (default to today)
  const [filterDate, setFilterDate] = useState(() => {
    // Default to user's local date in YYYY-MM-DD
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  });

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
  // Options: 'event' or 'content'
  const [packType, setPackType] = useState("event");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const router = useRouter();
  const { packId: initialPackId } = router.query;
  const [packRecordId, setPackRecordId] = useState(initialPackId || null);
  const [packProps, setPackProps] = useState([]);
  // Track when we're persisting prop order changes
  const [savingOrder, setSavingOrder] = useState(false);
  // Function to move a prop up or down in the packProps list
  const moveProp = async (id, direction) => {
    if (savingOrder) return;
    setSavingOrder(true);
    // Compute new order locally
    const idx = packProps.findIndex((p) => p.airtableId === id);
    const newIndex = idx + direction;
    if (idx < 0 || newIndex < 0 || newIndex >= packProps.length) {
      setSavingOrder(false);
      return;
    }
    const newArr = [...packProps];
    [newArr[idx], newArr[newIndex]] = [newArr[newIndex], newArr[idx]];
    setPackProps(newArr);
    // Persist the two swapped items
    const swappedA = newArr[newIndex];
    const swappedB = newArr[idx];
    try {
      await Promise.all([
        fetch('/api/props', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ propId: swappedA.airtableId, propOrder: newIndex }),
        }),
        fetch('/api/props', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ propId: swappedB.airtableId, propOrder: idx }),
        }),
      ]);
    } catch (err) {
      console.error('Error saving prop order:', err);
    }
    setSavingOrder(false);
  };
  const [loadingPackProps, setLoadingPackProps] = useState(false);
  const [propsError, setPropsError] = useState(null);
  const [newPropShort, setNewPropShort] = useState("");
  const [newPropSummary, setNewPropSummary] = useState("");
  const [newPropSideAShort, setNewPropSideAShort] = useState("");
  const [newPropSideBShort, setNewPropSideBShort] = useState("");
  const [newPropType, setNewPropType] = useState("fact");
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
  // Fetch events when modal opens
  useEffect(() => {
    if (!eventModalOpen) return;
    setLoadingEvents(true);
    setEventsError(null);
    fetch("/api/events")
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          // sort events by ascending eventTime (soonest first)
          const sortedEvents = data.events
            .slice()
            .sort((a, b) => new Date(a.eventTime) - new Date(b.eventTime));
          setEvents(sortedEvents);
        }
        else setEventsError(data.error);
      })
      .catch((err) => setEventsError(err.message))
      .finally(() => setLoadingEvents(false));
  }, [eventModalOpen]);
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
      const res = await fetch("/api/packs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packTitle, packURL: slug, packSummary, packType, eventId: selectedEvent?.id, packCoverUrl }),
      });
      const data = await res.json();
      if (data.success) {
        // Store created pack details and advance to props builder
        setPackDetails(data.record.fields);
        setPackRecordId(data.record.id);
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
    setLoadingPackProps(true);
    setPropsError(null);
    try {
      const res = await fetch(`/api/props?limit=100`);
      const data = await res.json();
      if (data.success) {
        const filtered = data.props.filter((p) => p.linkedPacks.includes(packRecordId));
        filtered.sort((a, b) => (a.propOrder || 0) - (b.propOrder || 0));
        setPackProps(filtered);
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

  // Inline handler to create a new prop
  const handleCreateProp = async (e) => {
    e.preventDefault();
    setLoadingPropCreate(true);
    setPropsError(null);
    try {
      const res = await fetch('/api/props', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          propShort: newPropShort,
          propSummary: newPropSummary,
          PropSideAShort: newPropSideAShort,
          PropSideBShort: newPropSideBShort,
          propType: newPropType,
          packId: packRecordId,
          propOrder: packProps.length,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setNewPropShort('');
        setNewPropSummary('');
        setNewPropSideAShort('');
        setNewPropSideBShort('');
        setNewPropType('fact');
        await fetchPackProps();
      } else {
        setPropsError(data.error);
      }
    } catch (err) {
      setPropsError(err.message);
    } finally {
      setLoadingPropCreate(false);
    }
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
   
  return (
    <div className="p-4 max-w-lg mx-auto">
      <h1 className="text-2xl font-bold mb-4">Create a Pack (v0.1)</h1>
      {/* Step 1: Pack Info */}
      {step === 1 && (
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Type selection at top */}
          <div>
            <label htmlFor="packType" className="block text-sm font-medium text-gray-700">Type</label>
            <select
              id="packType"
              value={packType}
              onChange={(e) => setPackType(e.target.value)}
              className="mt-1 block w-full border rounded px-2 py-1"
              required
            >
              <option value="event">Event</option>
              <option value="content">Content</option>
            </select>
          </div>
          {packType === "event" && (
            <div>
              <label className="block text-sm font-medium text-gray-700">Event</label>
              <button
                type="button"
                onClick={() => setEventModalOpen(true)}
                className="mt-1 px-2 py-1 bg-gray-200 rounded"
              >
                {selectedEvent ? "Change Event" : "Add Event"}
              </button>
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
              <img src={coverPreview} alt="Cover preview" className="mt-2 max-h-40 object-contain" />
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
      )}
      {step === 1 && eventModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-4 rounded max-w-md w-full">
            <h2 className="text-xl font-bold mb-4">Select Event</h2>
            {loadingEvents ? (
              <p>Loading events...</p>
            ) : eventsError ? (
              <p className="text-red-600">{eventsError}</p>
            ) : (
              <>
                <div className="mb-4">
                  <label htmlFor="sortOrder" className="block text-sm font-medium text-gray-700">Sort By</label>
                  <select
                    id="sortOrder"
                    value={sortOrder}
                    onChange={(e) => setSortOrder(e.target.value)}
                    className="mt-1 block w-full border rounded px-2 py-1"
                  >
                    <option value="asc">Soonest First</option>
                    <option value="desc">Latest First</option>
                  </select>
                </div>
                <div className="mb-4">
                  <label htmlFor="filterDate" className="block text-sm font-medium text-gray-700">Filter by Date</label>
                  <input
                    id="filterDate"
                    type="date"
                    value={filterDate}
                    onChange={(e) => setFilterDate(e.target.value)}
                    className="mt-1 block w-full border rounded px-2 py-1"
                  />
                </div>
                <ul className="max-h-64 overflow-y-auto space-y-2">
                  {events
                    .filter((evt) => {
                      if (!evt.eventTime) return false;
                      const d = new Date(evt.eventTime);
                      const yyyy = d.getFullYear();
                      const mm = String(d.getMonth() + 1).padStart(2, '0');
                      const dd = String(d.getDate()).padStart(2, '0');
                      return `${yyyy}-${mm}-${dd}` === filterDate;
                    })
                    .sort((a, b) =>
                      sortOrder === "asc"
                        ? new Date(a.eventTime) - new Date(b.eventTime)
                        : new Date(b.eventTime) - new Date(a.eventTime)
                    )
                    .map((evt) => (
                      <li key={evt.id}>
                        <button
                          type="button"
                          onClick={() => { setSelectedEvent(evt); setPackTitle(evt.eventTitle); setEventModalOpen(false); }}
                          className="w-full text-left px-2 py-1 hover:bg-gray-100 rounded"
                        >
                          {evt.eventTitle} — {new Date(evt.eventTime).toLocaleString()}
                        </button>
                      </li>
                    ))}
                </ul>
              </>
            )}
            <div className="mt-4 text-right">
              <button
                onClick={() => setEventModalOpen(false)}
                className="px-3 py-1 bg-gray-300 rounded hover:bg-gray-400"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step 2: Props Builder */}
      {step === 2 && packRecordId && (
        <div className="mt-8">
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
              {packDetails.packType === 'event' && selectedEvent && (
                <p><strong>Event:</strong> {selectedEvent.eventTitle} — {new Date(selectedEvent.eventTime).toLocaleString()}</p>
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
          <div className={`transition-opacity duration-200 ${savingOrder ? 'opacity-50' : 'opacity-100'}`}>
            <table className="min-w-full divide-y divide-gray-200 mb-6">
              <thead>
                <tr>
                  <th className="px-4 py-2"></th>
                  <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Order</th>
                  <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Short Label</th>
                  <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Side 1</th>
                  <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">Side 2</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {packProps.map((p, idx) => (
                  <tr key={p.airtableId}>
                    <td className="px-4 py-2">
                      <button
                        className="mr-2 text-sm text-gray-600 disabled:opacity-50"
                        disabled={savingOrder || idx === 0}
                        onClick={() => moveProp(p.airtableId, -1)}
                      >
                        ↑
                      </button>
                      <button
                        className="text-sm text-gray-600 disabled:opacity-50"
                        disabled={savingOrder || idx === packProps.length - 1}
                        onClick={() => moveProp(p.airtableId, 1)}
                      >
                        ↓
                      </button>
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-900">{idx + 1}</td>
                    <td className="px-4 py-2 text-sm text-gray-900">{p.propShort}</td>
                    <td className="px-4 py-2 text-sm text-gray-900">{p.PropSideAShort}</td>
                    <td className="px-4 py-2 text-sm text-gray-900">{p.PropSideBShort}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Inline new Prop form */}
          <form onSubmit={handleCreateProp} className="space-y-4">
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
            <button
              type="submit"
              disabled={loadingPropCreate}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {loadingPropCreate ? "Adding..." : "Add Prop"}
            </button>
          </form>
          {/* Action buttons: Preview & Cancel */}
          <div className="mt-6 flex space-x-4">
            <button
              type="button"
              onClick={() => setStep(3)}
              className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700"
            >
              Preview
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

      {/* Step 3: Preview & Publish */}
      {step === 3 && packRecordId && (
        <div className="mt-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            {/* Left: Pack details */}
            <div className="p-4 border rounded bg-gray-50">
              <h2 className="text-lg font-semibold mb-2">Pack Details Preview</h2>
              <p><strong>Title:</strong> {packDetails.packTitle}</p>
              <p><strong>Summary:</strong> {packDetails.packSummary}</p>
              <p><strong>Type:</strong> {packDetails.packType}</p>
              {packDetails.packType === 'event' && selectedEvent && (
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