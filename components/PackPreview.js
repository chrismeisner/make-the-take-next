import Link from "next/link";
import StatusPill from "./StatusPill";
// Simplified: we will read winner from pack.winnerProfileID (lookup) or pack.packWinnerRecordIds
import useCountdown from "../hooks/useCountdown";

export default function PackPreview({ pack }) {
  // Determine a common pack identifier
  const packID = pack.airtableId || pack.id || pack.packID;

  // Number of props assumed to be provided by pack.propsCount
  const propsCount = pack.propsCount || 0;
  const takeCount = pack.takeCount || 0;
  // User-specific verified take count from API
  const userTakesCount = pack.userTakesCount || 0;
  // Winner: prefer lookup winnerProfileID, fallback to first packWinner linked record id (if your UI uses it)
  const winnerID = pack.winnerProfileID || null;

  // Derive sorted event times
  const eventTimes = Array.isArray(pack.propEventRollup) ? [...pack.propEventRollup] : [];
  eventTimes.sort((a, b) => new Date(a) - new Date(b));
  // Compute earliest event date for display
  const earliestEventTime = eventTimes.length > 0 ? eventTimes[0] : pack.eventTime;
  const earliestDateObj = new Date(earliestEventTime);
  const isTodayDate = earliestDateObj.toDateString() === new Date().toDateString();
  const formattedEarliestDate = isTodayDate
    ? 'Today'
    : earliestDateObj.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
  // Compute next future event time and set up live countdown
  const now = Date.now();
  const futureEventTimes = eventTimes.filter(evt => new Date(evt).getTime() > now);
  const nextEventTime = futureEventTimes.length > 0 ? futureEventTimes[0] : null;
  const { days, hours, minutes, seconds, isCompleted } = useCountdown(nextEventTime || pack.eventTime);

  // Determine the cover URL.
  // If pack.packCover is an array, use the first attachment's URL.
  // Otherwise, if it's a string, use that value.
  let coverUrl;
  if (Array.isArray(pack.packCover) && pack.packCover.length > 0) {
	coverUrl = pack.packCover[0].url;
  } else if (typeof pack.packCover === "string") {
	coverUrl = pack.packCover;
  } else {
	coverUrl = null;
  }

  return (
	<Link
	  href={pack.hasSuperProp ? `/props/${pack.superProps[0]}` : `/packs/${pack.packURL}`}
	  className="w-full max-w-full border rounded shadow-sm bg-white overflow-hidden p-2 block text-black"
	>
	  <div
		className="aspect-square w-full relative bg-blue-600 bg-cover bg-center"
		style={{
		  backgroundImage: coverUrl ? `url(${coverUrl})` : undefined,
		}}
	  >
		{!coverUrl && (
		  <div className="flex items-center justify-center h-full">
			<span>No Cover</span>
		  </div>
		)}
	  </div>
	  <div className="p-4">
		<h2 className="text-lg font-semibold">
		  {pack.packTitle || "Untitled Pack"}
		</h2>
		{earliestEventTime && (
  <div className="mt-2 text-xs text-gray-600">
    <p>🗓️ {formattedEarliestDate}</p>
  </div>
)}
{futureEventTimes.length > 0 && (
  <div className="mt-2 text-sm text-gray-600">
    <p className="font-semibold">Next event in:</p>
    <p>{days}d {hours}h {minutes}m {seconds}s</p>
  </div>
)}
		<StatusPill status={pack.packStatus} />
		<div className="mt-2 text-sm text-gray-600">
		  <p>Props: {propsCount}</p>
		  <p>Total takes: {takeCount}</p>
		  <p>Your takes: {userTakesCount}/{propsCount}</p>
          {pack.packStatus === "graded" && winnerID && (<p>Winner: @{winnerID}</p>)}
		</div>
	  </div>
	</Link>
  );
}
