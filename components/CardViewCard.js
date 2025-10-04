import { usePackContext } from "../contexts/PackContext";
import { useModal } from "../contexts/ModalContext";
import { PropChoices } from "./VerificationWidget";
import { useState, useEffect } from "react";
 

export default function CardViewCard({ prop, currentReceiptId }) {
  const {
    selectedChoices,
    handleChoiceSelect,
    userTakesByProp,
    friendTakesByProp,
    packData,
  } = usePackContext();
  const { openModal } = useModal();

  // Determine this prop's slide index for sharing (cover is index 0)
  const propIndex = packData.props.findIndex((p) => p.propID === prop.propID);
  const slideIndex = propIndex >= 0 ? propIndex + 1 : 0;
  // Map propStatus values to display labels
  const statusLabels = { open: 'Open', closed: 'Closed', gradedA: 'Graded', gradedB: 'Graded' };
  const statusLabel = statusLabels[prop.propStatus] || prop.propStatus;
  const statusBgClass = prop.propStatus === 'closed' ? 'bg-red-100 text-red-600' : 'bg-gray-200 text-gray-800';
  // Determine user's previous take if any
  const userTake = userTakesByProp[prop.propID];
  // Determine friend's take if any
  const friendTake = friendTakesByProp?.[prop.propID];
  // Pre-select the side based on previous user take if no new selection
  const selected = selectedChoices[prop.propID] ?? userTake?.side;
  const alreadyTookSide = userTake?.side;

  // Live counts and refresh
  const [liveCounts, setLiveCounts] = useState({
    sideACount: prop.sideACount || 0,
    sideBCount: prop.sideBCount || 0,
  });
  const [, setLastUpdated] = useState(null);

  const fetchPropCounts = async (force = false) => {
    try {
      const resp = await fetch(`/api/prop?propID=${encodeURIComponent(prop.propID)}`);
      const data = await resp.json();
      if (data.success) {
        setLiveCounts({
          sideACount: data.sideACount || 0,
          sideBCount: data.sideBCount || 0,
        });
        setLastUpdated(new Date());
      } else {
        console.error("Error fetching prop counts:", data.error);
      }
    } catch (err) {
      console.error("Exception fetching prop counts:", err);
    }
  };

  useEffect(() => {
    fetchPropCounts();
  }, [prop.propID]);

  // Compute percentages with Laplace smoothing (+1 to each side)
  const rawA = liveCounts.sideACount;
  const rawB = liveCounts.sideBCount;
  const smoothedA = rawA + 1;
  const smoothedB = rawB + 1;
  const smoothedTotal = smoothedA + smoothedB;
  const sideAPct = Math.round((smoothedA / smoothedTotal) * 100);
  const sideBPct = 100 - sideAPct;
  const totalTakes = rawA + rawB;
  const resultsRevealed = prop.propStatus !== "open" || Boolean(alreadyTookSide);
  const readOnly = prop.propStatus !== "open";
  const { propSummary = "No summary provided", propShort, propResult = "" } = prop;
  const statusLc = String(prop.propStatus || '').toLowerCase();
  const isGraded = statusLc.startsWith('graded');
  // Show prop-specific event title and date/time if available
  const eventTimeRaw = prop.propEventTimeLookup;
  const eventTitleRaw = prop.propEventMatchup;
  let eventDateTime = null;
  if (eventTimeRaw) {
    eventDateTime = new Date(eventTimeRaw).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  }
  // Choose which summary to display: show result only when graded
  const displaySummary = (isGraded && propResult.trim()) ? propResult : propSummary;

  function handleShare() {
    // Neutral share: copy link to this pack/prop with optional ref, no challenge modal
    let shareUrl = `${window.location.origin}/packs/${packData.packURL}?prop=${slideIndex}`;
    if (currentReceiptId) {
      shareUrl += `&ref=${currentReceiptId}`;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(shareUrl).catch(() => {});
    }
  }

  // V1 live score fetcher: when event has started, poll minimal score from our API
  const [score, setScore] = useState(null);
  const [scoreError, setScoreError] = useState(null);
  useEffect(() => {
    // Use only the prop-linked event identifiers; do not fall back to pack-level
    const league = prop.propLeagueLookup;
    const espnId = prop.propESPNLookup;
    const eventStartMs = prop.propEventTimeLookup ? new Date(prop.propEventTimeLookup).getTime() : null;
    if (!league || !espnId || !eventStartMs) return;
    const now = Date.now();
    if (now < eventStartMs) return; // only fetch after event start
    let isActive = true;
    let timerId = null;
    async function loadScore() {
      try {
        const res = await fetch(`/api/scores?league=${encodeURIComponent(league)}&event=${encodeURIComponent(espnId)}`);
        const json = await res.json();
        if (!isActive) return;
        if (json && json.success) {
          setScore({ status: json.status, home: json.home, away: json.away, lastUpdated: json.lastUpdated });
          setScoreError(null);
        } else {
          setScoreError(json?.error || 'Error');
        }
      } catch (e) {
        if (!isActive) return;
        setScoreError('Network error');
      }
    }
    // initial fetch and poll every 45s
    loadScore();
    timerId = setInterval(loadScore, 45000);
    return () => { isActive = false; if (timerId) clearInterval(timerId); };
  }, [prop.propLeagueLookup, prop.propESPNLookup, prop.propEventTimeLookup]);

  return (
    <div className="bg-white border border-gray-300 rounded-md shadow-lg w-full max-w-[600px] aspect-square mx-auto flex flex-col justify-center p-4">
      {/* HEADER_HEIGHT: adjust this value (160px) to tweak status/title/overview block height */}
      <div className="mb-4 flex">
        {/* Left column: flex column to match image height and center content */}
        <div className="flex-1 pr-4 flex flex-col justify-start">
          <div className="mb-2">
            <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded ${statusBgClass}`}>
              {statusLabel}
            </span>
          </div>
          {/* Event title: as ESPN link if possible, otherwise plain text */}
          {eventTitleRaw && prop.propLeagueLookup && prop.propESPNLookup ? (
            <a
              href={`https://www.espn.com/${String(prop.propLeagueLookup).toLowerCase()}/boxscore/_/gameId/${prop.propESPNLookup}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-blue-600 underline mb-2 block"
            >
              {eventTitleRaw}
            </a>
          ) : eventTitleRaw ? (
            <p className="text-sm text-gray-500 mb-2">{eventTitleRaw}</p>
          ) : null}
          {/* Event date/time below title */}
          {eventDateTime && (
            <p className="text-sm text-gray-500 mb-2">{eventDateTime}</p>
          )}
          {/* Simple live score strip after event start */}
          {score && score.home && score.away && (
            <div className="text-sm text-gray-800 mb-2">
              <span className="font-semibold">Score:</span>{' '}
              <span>{score.away.abbreviation || score.away.name}: {score.away.score}</span>{' '}
              <span className="mx-1">@</span>
              <span>{score.home.abbreviation || score.home.name}: {score.home.score}</span>{' '}
              {score.status && (
                <span className="text-xs text-gray-500 ml-2">
                  {score.status.shortDetail || score.status.detail || String(score.status.state).toUpperCase()}
                </span>
              )}
            </div>
          )}
          
        </div>
        {prop.propCover && prop.propCover.length > 0 ? (
          <img
            src={prop.propCover[0].url}
            alt={prop.propShort || prop.propTitle || prop.propID}
            className="w-16 h-16 sm:w-24 sm:h-24 object-cover border border-gray-300 rounded-md"
          />
        ) : (
          <div className="w-16 h-16 sm:w-24 sm:h-24 bg-gray-100 border border-gray-300 rounded-md" />
        )}
      </div>
      {/* Full-width summary below header */}
      <div className="mb-4 w-full">
        {propShort && <p className="text-lg font-bold mb-2">{propShort}</p>}
        <p className="text-sm text-gray-500">{displaySummary}</p>
      </div>
      <PropChoices
        propStatus={prop.propStatus}
        selectedChoice={selected}
        resultsRevealed={resultsRevealed}
        onSelectChoice={readOnly ? () => {} : (side) => handleChoiceSelect(prop.propID, side)}
        choices={[
          {
            value: "A",
            label: prop.sideALabel,
            previewValue:
              prop.propValueModel === "vegas" && prop.propSideAValue != null
                ? `${(1 + Number(prop.propSideAValue) / 250).toFixed(2)}x`
                : undefined,
            percentage: sideAPct,
          },
          {
            value: "B",
            label: prop.sideBLabel,
            previewValue:
              prop.propValueModel === "vegas" && prop.propSideBValue != null
                ? `${(1 + Number(prop.propSideBValue) / 250).toFixed(2)}x`
                : undefined,
            percentage: sideBPct,
          },
        ]}
        alreadyTookSide={alreadyTookSide}
      />
      {friendTake?.side && (
        <p className="mt-2 text-sm text-gray-600 italic">
          Friend chose: <strong>{friendTake.side}</strong>
        </p>
      )}

      {/* Removed Share link and "Make The Take" line per request */}
    </div>
  );
} 