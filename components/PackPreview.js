import Link from "next/link";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Countdown from "./Countdown";
import { useModal } from "../contexts/ModalContext";
// Simplified: we will read winner from pack.winnerProfileID (lookup) or pack.packWinnerRecordIds

export default function PackPreview({ pack, className = "" }) {
  const { data: session } = useSession();
  // Determine a common pack identifier
  const packID = pack.packID || pack.id || pack.airtableId;

  // Number of props assumed to be provided by pack.propsCount
  const propsCount = pack.propsCount || 0;
  const takeCount = pack.takeCount || 0; // deprecated in UI
  // User-specific verified take count from API
  const [userTakesCount, setUserTakesCount] = useState(pack.userTakesCount || 0);
  // Winner: prefer lookup winnerProfileID, fallback to first packWinner linked record id (if your UI uses it)
  const winnerID = pack.winnerProfileID || null;
  const { openModal } = useModal();

  // Derive sorted event times
  const eventTimes = Array.isArray(pack.propEventRollup) ? [...pack.propEventRollup] : [];
  eventTimes.sort((a, b) => new Date(a) - new Date(b));
  // Compute earliest event time for logic
  const earliestEventTime = eventTimes.length > 0 ? eventTimes[0] : pack.eventTime;
  // (Date display removed)
  // Compute next future event time and set up live countdown
  const now = Date.now();
  const futureEventTimes = eventTimes.filter(evt => new Date(evt).getTime() > now);
  const nextEventTime = futureEventTimes.length > 0 ? futureEventTimes[0] : null;

  // Determine which time to count down to on the preview pill
  const statusNorm = String(pack.packStatus || '').toLowerCase();
  const isOpenLike = statusNorm === 'open' || statusNorm === 'active';
  const isComingSoon = statusNorm === 'coming up' || statusNorm === 'coming soon' || statusNorm === 'coming-soon' || statusNorm === 'upcoming';
  const pillEventTime = isOpenLike
    ? (pack.packCloseTime || nextEventTime || earliestEventTime)
    : (isComingSoon
      ? earliestEventTime
      : (nextEventTime || earliestEventTime));
  const pillLabelPrefix = isOpenLike && pack.packCloseTime ? 'Closes in' : 'Starts in';

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

  const disabled = isDisabled || isComingSoon;

  const content = (
	  <div className="flex flex-row items-stretch gap-3">
		<div className="order-2 aspect-square w-28 md:w-48 relative bg-gray-100 flex-shrink-0">
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
		<div className="order-1 p-4 flex-1">
			<h2 className="text-lg font-semibold">
				{pack.packTitle || "Untitled Pack"}
			</h2>
			{pack.packSummary && (
				<p className="mt-1 text-sm text-gray-700">{pack.packSummary}</p>
			)}
			{isOpenLike && propsCount > 0 && (
				<div className="mt-1 text-xs text-gray-700">
					{propsCount} {propsCount === 1 ? 'prop' : 'props'}
				</div>
			)}
			{/* Date and status labels removed on request */}
			{(isOpenLike || isComingSoon) && (
				<div className="mt-2">
					<Countdown targetTime={pillEventTime} prefix={isOpenLike && pack.packCloseTime ? 'Closes in' : ''} />
				</div>
			)}
			{isOpenLike && (
				<div className="mt-3 flex items-center gap-2">
					<div className="inline-flex items-center justify-center px-3 py-2 rounded bg-blue-600 text-white text-sm font-medium hover:bg-blue-700">
						Play this pack
					</div>
					<button
						type="button"
						onClick={(e) => { e.preventDefault(); e.stopPropagation(); openModal('sharePack', { packTitle: pack.packTitle, packSummary: pack.packSummary, packUrl: typeof window !== 'undefined' ? `${window.location.origin}/packs/${pack.packURL}` : '' }); }}
						className="inline-flex items-center justify-center px-3 py-2 rounded bg-gray-200 text-gray-900 text-sm font-medium hover:bg-gray-300"
					>
						Share
					</button>
				</div>
			)}
			{!isOpenLike && (
				<div className="mt-3">
					<button
						type="button"
						onClick={(e) => { e.preventDefault(); openModal('notifyMe', { packTitle: pack.packTitle }); }}
						className="inline-flex items-center justify-center px-3 py-2 rounded bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-400 shadow-sm"
					>
						Notify me when this pack drops
					</button>
				</div>
			)}
			<div className="mt-2 text-sm text-gray-600">
				{pack.packStatus === "graded" && winnerID && (<p>Winner: @{winnerID}</p>)}
			</div>
		</div>
	  </div>
  );

  if (isComingSoon) {
	  return (
		  <div
			  aria-label={(pack.packTitle || 'Pack') + ' preview'}
			  aria-disabled="true"
			  className={`w-full max-w-full border rounded shadow-sm bg-white overflow-hidden p-2 block text-black opacity-60 cursor-not-allowed transition-shadow hover:shadow-md ${className}`}
		  >
			  {content}
		  </div>
	  );
  }

  return (
	  <Link
		  href={targetHref}
		  aria-label={(pack.packTitle || "Pack") + " preview"}
		  aria-disabled={disabled}
		  className={`w-full max-w-full border rounded shadow-sm bg-white overflow-hidden p-2 block text-black transition-shadow hover:shadow-md ${className}`}
	  >
		  {content}
	  </Link>
  );
}
