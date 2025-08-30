import Link from "next/link";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Countdown from "./Countdown";
import { useModal } from "../contexts/ModalContext";
// Simplified: we will read winner from pack.winnerProfileID (lookup) or pack.packWinnerRecordIds

export default function PackPreview({ pack, className = "", accent = "blue" }) {
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

  // Derive sorted, de-duplicated event times (ms) from rollup or single string
  function parseEventTimesToMs(input) {
    const entries = [];
    if (Array.isArray(input)) {
      for (const item of input) {
        if (typeof item === 'string') {
          const parts = item.split(',').map(s => s.trim()).filter(Boolean);
          entries.push(...parts);
        } else if (item) {
          entries.push(String(item));
        }
      }
    } else if (typeof input === 'string') {
      const parts = input.split(',').map(s => s.trim()).filter(Boolean);
      entries.push(...parts);
    } else if (input) {
      entries.push(String(input));
    }
    const msValues = entries
      .map(str => new Date(str).getTime())
      .filter(v => Number.isFinite(v));
    const unique = Array.from(new Set(msValues));
    unique.sort((a, b) => a - b);
    return unique;
  }

  const eventMsList = parseEventTimesToMs(pack.propEventRollup?.length ? pack.propEventRollup : pack.eventTime);
  const earliestEventMs = eventMsList.length > 0 ? eventMsList[0] : (pack.eventTime ? new Date(pack.eventTime).getTime() : NaN);
  const now = Date.now();
  const nextEventMs = eventMsList.find(ms => ms > now) ?? null;

  function formatDropDate(ms) {
    if (!Number.isFinite(ms)) return 'TBD';
    const d = new Date(ms);
    const weekday = d.toLocaleDateString(undefined, { weekday: 'long' });
    const monthIndex = d.getMonth();
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];
    const month = months[monthIndex] || '';
    const day = d.getDate();
    const ordinal = (n) => {
      const s = ['th', 'st', 'nd', 'rd'];
      const v = n % 100;
      return s[(v - 20) % 10] || s[v] || s[0];
    };
    return `${weekday}, ${month} ${day}${ordinal(day)}`;
  }

  // Determine which time to count down to on the preview pill
  const statusNorm = String(pack.packStatus || '').toLowerCase();
  const isOpenLike = statusNorm === 'open' || statusNorm === 'active';
  const isComingSoon = statusNorm === 'coming up' || statusNorm === 'coming soon' || statusNorm === 'coming-soon' || statusNorm === 'upcoming';
  const pillEventTime = isOpenLike
    ? (pack.packCloseTime || nextEventMs || earliestEventMs)
    : (isComingSoon
      ? earliestEventMs
      : (nextEventMs || earliestEventMs));
  

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

  const primaryBtnBase = "inline-flex items-center justify-center px-2.5 py-1.5 md:px-3 md:py-2 rounded text-white text-xs md:text-sm font-medium";
  const primaryBtnColor = accent === 'green' ? 'bg-green-600 hover:bg-green-700' : 'bg-blue-600 hover:bg-blue-700';

  const content = (
	  <div className="flex flex-col md:flex-row items-stretch md:items-start gap-2 md:gap-3">
		<div className="order-1 md:order-2 w-full md:basis-1/3 md:max-w-xs aspect-square relative bg-gray-100">
			{coverUrl ? (
				<img
					src={coverUrl}
					alt={`${pack.packTitle || "Pack"} cover`}
					className={`absolute inset-0 w-full h-full object-cover ${disabled ? 'grayscale opacity-60' : ''}`}
					loading="lazy"
				/>
			) : (
				<div className="flex items-center justify-center h-full">
					<span>No Cover</span>
				</div>
			)}
		</div>
		<div className="order-2 md:order-1 p-3 md:p-4 flex-1 md:basis-2/3">
			<h2 className="text-base md:text-lg font-semibold">
				{pack.packTitle || "Untitled Pack"}
			</h2>
			<div className="mt-1" />
			{isOpenLike && propsCount > 0 && (
				<div className="mt-1 text-xs md:text-sm text-gray-700">
					{propsCount} {propsCount === 1 ? 'Prop Available' : 'Props Available'}
				</div>
			)}
			{isOpenLike && (
				<div className="mt-1 text-sm text-gray-700">
					<span>⏱️ </span><Countdown targetTime={pillEventTime} />
				</div>
			)}
			{!isOpenLike && isComingSoon && (
				<div className="mt-1 text-sm text-gray-700">
					{(() => {
						const dropMs = Number.isFinite(earliestEventMs)
							? earliestEventMs
							: (pack.packOpenTime ? new Date(pack.packOpenTime).getTime() : NaN);
						return `🗓️ ${formatDropDate(dropMs)}`;
					})()}
				</div>
			)}
			{pack.firstPlace && (
				<div className="mt-2 inline-flex items-center gap-1 bg-yellow-100 text-yellow-900 text-xs font-medium px-2 py-1 rounded">
					<span aria-hidden>🏆</span>
					<span>{pack.firstPlace}</span>
				</div>
			)}

			{/* Date and status labels removed on request */}

			{isOpenLike && (
				<div className="mt-3 flex items-center gap-2">
					<div className={`${primaryBtnBase} ${primaryBtnColor}`}>
						Play this pack
					</div>
					<button
						type="button"
						onClick={(e) => { e.preventDefault(); e.stopPropagation(); openModal('sharePack', { packTitle: pack.packTitle, packSummary: pack.packSummary, packUrl: typeof window !== 'undefined' ? `${window.location.origin}/packs/${pack.packURL}` : '' }); }}
						className="inline-flex items-center justify-center px-2.5 py-1.5 md:px-3 md:py-2 rounded bg-gray-200 text-gray-900 text-xs md:text-sm font-medium hover:bg-gray-300"
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
						className="inline-flex items-center justify-center px-2.5 py-1.5 md:px-3 md:py-2 rounded bg-blue-600 text-white text-xs md:text-sm font-semibold hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-400 shadow-sm"
					>
						Notify me
					</button>
				</div>
			)}
			<div className="mt-2 text-xs md:text-sm text-gray-600">
				{pack.packStatus === "graded" && winnerID && (<p>Winner: @{winnerID}</p>)}
			</div>
		</div>
	  </div>
  );

  if (isComingSoon) {
	  return (
		  <div
			  aria-label={(pack.packTitle || 'Pack') + ' preview'}
			  className={`w-full max-w-full border rounded shadow-sm bg-white overflow-hidden p-2 block text-black transition-shadow hover:shadow-md ${className}`}
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
