import Link from "next/link";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import StatusPill from "./StatusPill";
// Simplified: we will read winner from pack.winnerProfileID (lookup) or pack.packWinnerRecordIds

export default function PackPreview({ pack, className = "" }) {
  const { data: session } = useSession();
  // Determine a common pack identifier
  const packID = pack.packID || pack.id || pack.airtableId;

  // Number of props assumed to be provided by pack.propsCount
  const propsCount = pack.propsCount || 0;
  const takeCount = pack.takeCount || 0;
  // User-specific verified take count from API
  const [userTakesCount, setUserTakesCount] = useState(pack.userTakesCount || 0);
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

  // Client-side: fetch accurate user progress if logged in
  useEffect(() => {
    if (!session || !packID) return;
    let isActive = true;
    const controller = new AbortController();
    async function loadProgress() {
      try {
        const res = await fetch(`/api/userPackProgress?packID=${encodeURIComponent(packID)}`, { signal: controller.signal });
        if (!res.ok) return;
        const json = await res.json();
        if (!json?.success) return;
        if (isActive) {
          const completed = Number(json.completedCount || 0);
          setUserTakesCount(completed);
        }
      } catch (err) {
        // ignore fetch aborts
      }
    }
    loadProgress();
    return () => {
      isActive = false;
      controller.abort();
    };
  }, [session, packID]);

  // Determine target href safely
  const hasValidSuperProp = Boolean(
    pack.hasSuperProp && Array.isArray(pack.superProps) && pack.superProps.length > 0
  );
  const targetHref = hasValidSuperProp
    ? `/props/${pack.superProps[0]}`
    : pack.packURL
      ? `/packs/${pack.packURL}`
      : "#";
  const isDisabled = targetHref === "#";

  return (
	<Link
	  href={targetHref}
	  aria-label={(pack.packTitle || "Pack") + " preview"}
	  aria-disabled={isDisabled}
	  className={`w-full max-w-full border rounded shadow-sm bg-white overflow-hidden p-2 block text-black ${className}`}
	>
	  <div className="aspect-square w-full relative bg-gray-100">
		{coverUrl ? (
		  <img
			src={coverUrl}
			alt={`${pack.packTitle || "Pack"} cover`}
			className="absolute inset-0 w-full h-full object-cover"
			loading="lazy"
		  />
		) : (
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
        <StatusPill status={pack.packStatus} eventTime={nextEventTime || earliestEventTime} />
		<div className="mt-2 text-sm text-gray-600">
		  <p>Props: {propsCount}</p>
          <p>Total takes: {takeCount}</p>
          {session && (
            <p>Your takes: {userTakesCount}/{propsCount}</p>
          )}
          {pack.packStatus === "graded" && winnerID && (<p>Winner: @{winnerID}</p>)}
		</div>
	  </div>
	</Link>
  );
}
