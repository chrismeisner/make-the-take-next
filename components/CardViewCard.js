import Link from "next/link";
import { usePackContext } from "../contexts/PackContext";
import { PropChoices } from "./VerificationWidget";
import { useState, useEffect } from "react";

export default function CardViewCard({ prop }) {
  const {
    selectedChoices,
    handleChoiceSelect,
    userTakesByProp,
  } = usePackContext();
  // Determine user's previous take if any
  const userTake = userTakesByProp[prop.propID];
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

  // Compute percentages with a base vote
  const rawA = liveCounts.sideACount;
  const rawB = liveCounts.sideBCount;
  const totalTakes = rawA + rawB;
  const sideA = rawA + 1;
  const sideB = rawB + 1;
  const total = sideA + sideB;
  const sideAPct = Math.round((sideA / total) * 100);
  const sideBPct = 100 - sideAPct;

  const resultsRevealed = Boolean(selected || alreadyTookSide);
  const readOnly = prop.propStatus !== "open";
  const { propSummary = "No summary provided", propShort } = prop;

  return (
    <div className="bg-white border border-gray-300 rounded-md shadow-lg p-4 w-full max-w-[600px] mx-auto">
      {propShort && <p className="text-sm text-gray-500 mb-1">{propShort}</p>}
      <p className="text-lg font-semibold mb-2">{propSummary}</p>

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
      <p className="text-xs text-gray-500">
        Last updated: {lastUpdated ? lastUpdated.toLocaleTimeString() : "–"}{" "}
        <button onClick={() => fetchPropCounts(true)} className="underline ml-2">
          Refresh
        </button>
      </p>
      <p className="text-sm text-gray-700">
        {total} {total === 1 ? "Take" : "Takes"} Made
      </p>

      <div className="mt-1 text-sm">
        <Link href={`/props/${prop.propID}`} className="text-blue-600 underline">
          See prop detail
        </Link>
      </div>
    </div>
  );
} 