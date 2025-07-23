import Link from "next/link";
import { usePackContext } from "../contexts/PackContext";
import { PropChoices } from "./VerificationWidget";
import { useState, useEffect } from "react";

export default function CardViewCard({ prop }) {
  const {
    selectedChoices,
    handleChoiceSelect,
    userTakesByProp,
    friendTakesByProp,
  } = usePackContext();
  // Map propStatus values to display labels
  const statusLabels = { open: 'Open', closed: 'Closed', gradedA: 'Graded', gradedB: 'Graded' };
  const statusLabel = statusLabels[prop.propStatus] || prop.propStatus;
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
  const [lastUpdated, setLastUpdated] = useState(null);

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

  // Compute percentages
  const rawA = liveCounts.sideACount;
  const rawB = liveCounts.sideBCount;
  const totalTakes = rawA + rawB;
  const sideAPct = totalTakes === 0 ? 50 : Math.round((rawA / totalTakes) * 100);
  const sideBPct = totalTakes === 0 ? 50 : 100 - sideAPct;

  const resultsRevealed = Boolean(selected || alreadyTookSide);
  const readOnly = prop.propStatus !== "open";
  const { propSummary = "No summary provided", propShort, propResult = "" } = prop;
  // Choose which summary to display when graded
  const displaySummary = (prop.propStatus !== "open" && propResult.trim())
    ? propResult
    : propSummary;

  return (
    <div className="bg-white border border-gray-300 rounded-md shadow-lg w-full max-w-[600px] aspect-square mx-auto flex flex-col justify-center p-4">
      {/* Status badge */}
      <div className="mb-2">
        <span className="inline-block px-2 py-0.5 text-xs font-medium bg-gray-200 text-gray-800 rounded">
          {statusLabel}
        </span>
      </div>
      {propShort && <p className="text-lg font-bold mb-2">{propShort}</p>}
      <p className="text-sm text-gray-500 mb-4">{displaySummary}</p>

      <PropChoices
        propStatus={prop.propStatus}
        selectedChoice={selected}
        resultsRevealed={resultsRevealed}
        onSelectChoice={readOnly ? () => {} : (side) => handleChoiceSelect(prop.propID, side)}
        sideAPct={sideAPct}
        sideBPct={sideBPct}
        sideALabel={prop.sideALabel}
        sideBLabel={prop.sideBLabel}
        alreadyTookSide={alreadyTookSide}
      />
      {friendTake?.side && (
        <p className="mt-2 text-sm text-gray-600 italic">
          Friend chose: <strong>{friendTake.side}</strong>
        </p>
      )}
      <p className="text-xs text-gray-500">
        Last updated: {lastUpdated ? lastUpdated.toLocaleTimeString() : "–"}{" "}
        <button onClick={() => fetchPropCounts(true)} className="underline ml-2">
          Refresh
        </button>
      </p>
      <p className="text-sm text-gray-700">
        {totalTakes} {totalTakes === 1 ? "Take" : "Takes"} Made
      </p>

      <div className="mt-1 text-sm">
        <Link href={`/props/${prop.propID}`} className="text-blue-600 underline">
          See prop detail
        </Link>
      </div>
    </div>
  );
} 