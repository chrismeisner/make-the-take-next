import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Countdown from "./Countdown";
import { useModal } from "../contexts/ModalContext";
// Simplified: we will read winner from pack.winnerProfileID (lookup) or pack.packWinnerRecordIds

export default function PackPreview({ pack, className = "", accent = "blue" }) {
  const { data: session } = useSession();
  const router = useRouter();
  // Determine a common pack identifier
  const packID = pack.packID || pack.id || pack.airtableId;

  // Number of props assumed to be provided by pack.propsCount
  const propsCount = pack.propsCount || 0;
  const takeCount = pack.takeCount || 0; // deprecated in UI
  // User-specific verified take count from API
  const [userTakesCount, setUserTakesCount] = useState(pack.userTakesCount || 0);
  // Winner: prefer lookup winnerProfileID, fallback to first packWinner linked record id (if your UI uses it)
  const winnerID = pack.winnerProfileID || null;
  const winnerPoints = typeof pack.winnerPoints === 'number' ? pack.winnerPoints : null;
  const { openModal } = useModal();
  const [notifyState, setNotifyState] = useState('idle'); // idle | loading | done | error

  const [eventScores, setEventScores] = useState({});
  const [scoresLoading, setScoresLoading] = useState(false);

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

  function parseToMs(val) {
    if (val == null) return NaN;
    if (typeof val === 'number') return Number.isFinite(val) ? val : NaN;
    if (typeof val === 'string') {
      const trimmed = val.trim();
      if (/^\d{11,}$/.test(trimmed)) {
        const n = Number(trimmed);
        return Number.isFinite(n) ? n : NaN;
      }
      const ms = new Date(trimmed).getTime();
      return Number.isFinite(ms) ? ms : NaN;
    }
    try {
      const ms = new Date(val).getTime();
      return Number.isFinite(ms) ? ms : NaN;
    } catch { return NaN; }
  }

  // Removed formatted date display for coming soon countdown

  // Determine which time to count down to on the preview pill
  const statusNorm = String(pack.packStatus || '').toLowerCase();
  const isOpenLike = statusNorm === 'open' || statusNorm === 'active';
  const isComingSoon = statusNorm === 'coming up' || statusNorm === 'coming soon' || statusNorm === 'coming-soon' || statusNorm === 'upcoming';
  const packCloseMs = parseToMs(pack.packCloseTime);
  const packOpenMs = parseToMs(pack.packOpenTime);
  const pillEventTime = isOpenLike
    ? (Number.isFinite(packCloseMs) ? packCloseMs : (nextEventMs || earliestEventMs))
    : (isComingSoon
      ? earliestEventMs
      : (nextEventMs || earliestEventMs));
  
  // Derive a simple status chip for display
  const statusInfo = (() => {
    const s = String(pack.packStatus || '').toLowerCase().replace(/\s+/g, '-');
    if (s === 'open' || s === 'active') {
      return { label: 'Active', classes: 'bg-green-100 text-green-800 border border-green-200' };
    }
    if (s === 'coming-soon' || s === 'coming-up' || s === 'upcoming') {
      return { label: 'Coming soon', classes: 'bg-orange-100 text-orange-800 border border-orange-200' };
    }
    if (s === 'closed') {
      return { label: 'Closed', classes: 'bg-gray-200 text-gray-800 border border-gray-300' };
    }
    if (s === 'live') {
      return { label: 'Live', classes: 'bg-gray-200 text-gray-800 border border-gray-300' };
    }
    if (s === 'completed') {
      return { label: 'Completed', classes: 'bg-gray-200 text-gray-800 border border-gray-300' };
    }
    if (s === 'pending-grade') {
      return { label: 'Pending Grade', classes: 'bg-purple-100 text-purple-800 border border-purple-200' };
    }
    if (s === 'graded') {
      return { label: 'Graded', classes: 'bg-blue-100 text-blue-800 border border-blue-200' };
    }
    return { label: '', classes: '' };
  })();


  // Derive a game status chip (for ESPN game status)
  function getGameStatusChip(status) {
    if (!status || !status.state) return null;
    const state = String(status.state).toLowerCase();
    if (state === 'in') {
      return { label: 'LIVE', classes: 'bg-red-100 text-red-800 border border-red-200' };
    }
    if (state === 'post') {
      return { label: 'FINAL', classes: 'bg-gray-200 text-gray-800 border border-gray-300' };
    }
    if (state === 'pre') {
      return { label: 'SCHEDULED', classes: 'bg-blue-100 text-blue-800 border border-blue-200' };
    }
    if (state === 'delayed') {
      return { label: 'DELAYED', classes: 'bg-orange-100 text-orange-800 border border-orange-200' };
    }
    return null;
  }

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

  useEffect(() => {
    const events = Array.isArray(pack?.events) ? pack.events : [];
    const targets = events
      .filter((e) => e && e.espnGameID)
      .slice(0, 2);
    if (targets.length === 0) return;
    let isActive = true;
    const controller = new AbortController();
    async function loadScores() {
      try {
        setScoresLoading(true);
        const results = await Promise.all(
          targets.map(async (evt) => {
            const league = (evt.league || pack.packLeague || '').toString();
            if (!league) return [evt.espnGameID, null];
            const url = `/api/scores?league=${encodeURIComponent(league)}&event=${encodeURIComponent(evt.espnGameID)}`;
            const res = await fetch(url, { signal: controller.signal });
            if (!res.ok) return [evt.espnGameID, null];
            const json = await res.json();
            if (!json?.success) return [evt.espnGameID, null];
            return [evt.espnGameID, json];
          })
        );
        if (!isActive) return;
        const map = {};
        for (const [id, data] of results) {
          map[id] = data;
        }
        setEventScores(map);
      } catch (_) {
      } finally {
        if (isActive) setScoresLoading(false);
      }
    }
    loadScores();
    return () => {
      isActive = false;
      controller.abort();
    };
  }, [pack?.events, pack?.packLeague]);

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

  async function handleNotifyClick(e) {
    e.preventDefault();
    e.stopPropagation();
    try {
      // Debug log: button click
      try { console.log('[PackPreview] Notify click', { packURL: pack?.packURL, profileID: session?.user?.profileID }); } catch {}
      if (!session?.user) {
        openModal('notifyMe', { packTitle: pack.packTitle, packURL: pack.packURL });
        return;
      }
      if (!pack?.packURL || notifyState === 'loading' || notifyState === 'done') return;
      setNotifyState('loading');
      const resp = await fetch('/api/packs/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packURL: pack.packURL }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || !data?.success) throw new Error(data?.error || 'Failed to subscribe');
      try { console.log('[PackPreview] Notify success', { packURL: pack?.packURL, alreadySubscribed: Boolean(data?.alreadySubscribed) }); } catch {}
      setNotifyState('done');
    } catch (_) {
      try { console.error('[PackPreview] Notify error', _); } catch {}
      setNotifyState('error');
      setTimeout(() => setNotifyState('idle'), 2000);
    }
  }

  const content = (
	  <div className="flex flex-col md:flex-row items-stretch md:items-start gap-2 md:gap-3">
		<div className="order-1 md:order-2 w-full md:basis-1/3 md:max-w-xs aspect-square relative bg-gray-100">
			{coverUrl ? (
				<img
					src={coverUrl}
					alt={`${pack.packTitle || "Pack"} cover`}
					className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-200 ${isComingSoon ? 'opacity-90 group-hover:opacity-100' : ''}`}
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
			{Array.isArray(pack.linkedTeams) && pack.linkedTeams.length > 0 && (
				<div className="mt-1 flex flex-wrap gap-1">
				{Array.from(new Map(pack.linkedTeams.filter(t => t && t.slug).map(t => [t.slug, t])).values())
						.slice(0, 4)
						.map((t) => (
							<span
								key={t.slug}
								role="link"
								tabIndex={0}
									onClick={(e) => { e.preventDefault(); e.stopPropagation(); router.push(`/${t.slug}`); }}
							onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); router.push(`/${t.slug}`); } }}
								className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-gray-300 text-xs text-gray-800 bg-gray-100 hover:bg-gray-200"
								aria-label={`View team ${t.name || t.slug}`}
							>
								{t.logoUrl ? (
									<img src={t.logoUrl} alt="" className="w-4 h-4 rounded-sm" loading="lazy" />
								) : null}
								<span>{(t.name || t.slug).toString()}</span>
							</span>
						))}
					</div>
				)}
			<div className="mt-1" />
			{statusInfo.label && (
				<div className="mt-1">
					<span className={`${statusInfo.classes} inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium`}>
						{statusInfo.label}
					</span>
				</div>
			)}
			{pack.packPrize && (
				<div className="mt-2 inline-flex items-center gap-1 bg-yellow-100 text-yellow-900 text-xs font-medium px-2 py-1 rounded">
					<span aria-hidden>🏆</span>
					<span>{pack.packPrize}</span>
				</div>
			)}
			{(() => {
				const displayEvents = (Array.isArray(pack?.events) ? pack.events.filter(e => e && e.espnGameID) : []).slice(0, 2);
				if (displayEvents.length === 0) return null;
				return (
					<div className="mt-2 text-xs md:text-sm text-gray-800">
						{displayEvents.map((evt, idx) => {
							const data = evt?.espnGameID ? eventScores[evt.espnGameID] : null;
							const home = data?.home; const away = data?.away; const st = data?.status;
							return (
								<div key={`${evt.id || evt.espnGameID || idx}`} className="flex items-center gap-2">
									<span className="text-gray-600">{(evt.league || '').toUpperCase()}</span>
							{(() => { const chip = getGameStatusChip(st); return chip ? (
								<span className={`${chip.classes} inline-flex items-center rounded-full px-2 py-0.5 text-[10px] md:text-xs font-medium`}>
									{chip.label}
								</span>
							) : null; })()}
							{home && away ? (
										<span>
											{away.abbreviation || away.name} {away.score}
											<span className="mx-1">@</span>
											{home.abbreviation || home.name} {home.score}
											{st?.shortDetail ? <span className="ml-2 text-gray-600">{st.shortDetail}</span> : null}
										</span>
									) : (
										<span className="text-gray-600">Fetching score…</span>
									)}
								</div>
							);
						})}
					</div>
				);
			})()}
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
						const closeMs = Number.isFinite(packCloseMs) ? packCloseMs : NaN;
						const dropMs = Number.isFinite(closeMs)
							? closeMs
							: (Number.isFinite(earliestEventMs)
								? earliestEventMs
								: (pack.packOpenTime ? new Date(pack.packOpenTime).getTime() : NaN));
						return (
							<>
								<div><span>⏰ </span><Countdown targetTime={dropMs} /></div>
							</>
						);
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
						<span
							role="button"
							tabIndex={0}
							onClick={(e) => { e.preventDefault(); e.stopPropagation(); openModal('sharePack', { packTitle: pack.packTitle, packSummary: pack.packSummary, packUrl: typeof window !== 'undefined' ? `${window.location.origin}/packs/${pack.packURL}` : '' }); }}
							onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); openModal('sharePack', { packTitle: pack.packTitle, packSummary: pack.packSummary, packUrl: typeof window !== 'undefined' ? `${window.location.origin}/packs/${pack.packURL}` : '' }); } }}
							className="inline-flex items-center justify-center px-2.5 py-1.5 md:px-3 md:py-2 rounded bg-gray-200 text-gray-900 text-xs md:text-sm font-medium hover:bg-gray-300"
						>
							Share
						</span>
					</div>
				)}
				{!isOpenLike && isComingSoon && (
					<div className="mt-3">
						<button
							type="button"
							onClick={handleNotifyClick}
							disabled={notifyState === 'loading' || notifyState === 'done'}
							className={`${primaryBtnBase} ${notifyState === 'done' ? 'bg-gray-400 cursor-default' : 'bg-orange-600 hover:bg-orange-700'}`}
						>
							{notifyState === 'loading' ? 'Adding…' : (notifyState === 'done' ? "We'll notify you" : 'Notify me')}
						</button>
					</div>
				)}
			<div className="mt-2 text-xs md:text-sm text-gray-600">
				{pack.packStatus === "graded" && winnerID && (
					<p>
						Winner: @{winnerID}
						{Number.isFinite(winnerPoints) ? ` • ${winnerPoints} pts` : ''}
					</p>
				)}
			</div>
		</div>
	  </div>
  );

  if (isComingSoon) {
	  return (
		  <Link
			  href={targetHref}
			  aria-label={(pack.packTitle || "Pack") + " preview"}
			  aria-disabled={disabled}
			  onClick={(e) => { e.preventDefault(); e.stopPropagation(); openModal('notifyMe', { packTitle: pack.packTitle }); }}
			  className={`group w-full max-w-full border rounded shadow-sm bg-white overflow-hidden p-2 block text-black transition-shadow hover:shadow-md ${className}`}
		  >
			  {content}
		  </Link>
	  );
  }

  return (
	  <Link
		  href={targetHref}
		  aria-label={(pack.packTitle || "Pack") + " preview"}
		  aria-disabled={disabled}
		  className={`group w-full max-w-full border rounded shadow-sm bg-white overflow-hidden p-2 block text-black transition-shadow hover:shadow-md ${className}`}
	  >
		  {content}
	  </Link>
  );
}
