import Link from "next/link";
import { usePackContext } from "../contexts/PackContext";
import { PropChoices } from "./VerificationWidget";

export default function CardViewCard({ prop }) {
  const {
    selectedChoices,
    handleChoiceSelect,
    userTakesByProp,
  } = usePackContext();
  const selected = selectedChoices[prop.propID];
  const userTake = userTakesByProp[prop.propID];
  const alreadyTookSide = userTake?.side;

  // Compute percentages with a base vote
  const rawA = prop.sideACount || 0;
  const rawB = prop.sideBCount || 0;
  const sideA = rawA + 1;
  const sideB = rawB + 1;
  const total = sideA + sideB;
  const sideAPct = Math.round((sideA / total) * 100);
  const sideBPct = 100 - sideAPct;

  const resultsRevealed = Boolean(selected || alreadyTookSide);
  const readOnly = prop.propStatus !== "open";
  const { propSummary = "No summary provided" } = prop;

  return (
    <div className="bg-white border border-gray-300 rounded-md shadow-lg p-4 w-full max-w-[600px] mx-auto">
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

      <div className="mt-1 text-sm">
        <Link href={`/props/${prop.propID}`} className="text-blue-600 underline">
          See prop detail
        </Link>
      </div>
    </div>
  );
} 