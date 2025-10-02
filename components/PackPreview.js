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

  const [eventScores, setEventScores] = useState({});
  const [scoresLoading, setScoresLoading] = useState(false);
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const [willNotify, setWillNotify] = useState(false);
  const [userLeagues, setUserLeagues] = useState([]);
  const [notifyLoading, setNotifyLoading] = useState(false);

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

  // Load user notification preferences to determine if we should show a
  // "you'll be notified" message for coming-soon packs
  useEffect(() => {
    let isActive = true;
    const controller = new AbortController();
    async function loadPrefs() {
      try {
        setPrefsLoaded(false);
        setWillNotify(false);
        if (!session?.user) return;
        if (!isComingSoon) return;
        const [prefRes, teamRes] = await Promise.all([
          fetch('/api/notifications/preferences', { signal: controller.signal }),
          fetch('/api/notifications/teamPreferences', { signal: controller.signal }),
        ]);
        const [prefJson, teamJson] = await Promise.all([
          prefRes.ok ? prefRes.json() : Promise.resolve(null),
          teamRes.ok ? teamRes.json() : Promise.resolve(null),
        ]);
        if (!isActive) return;
        const packLeague = String(pack?.packLeague || '').toLowerCase();
        const leagues = Array.isArray(prefJson?.leagues) ? prefJson.leagues.map((l) => String(l || '').toLowerCase()) : [];
        setUserLeagues(leagues);
        const smsOptOutAll = Boolean(prefJson?.smsOptOutAll);
        const leagueMatch = !!packLeague && leagues.includes(packLeague);
        let teamMatch = false;
        try {
          const linked = Array.isArray(pack?.linkedTeams) ? pack.linkedTeams : [];
          const userTeams = Array.isArray(teamJson?.teams) ? teamJson.teams : [];
          const userTeamSlugs = new Set(userTeams.map((t) => String(t?.teamSlug || '').toLowerCase()).filter(Boolean));
          teamMatch = linked.some((t) => userTeamSlugs.has(String(t?.slug || '').toLowerCase()));
        } catch {}
        setWillNotify(!smsOptOutAll && (leagueMatch || teamMatch));
      } catch (_) {
        if (!isActive) return;
        setWillNotify(false);
      } finally {
        if (isActive) setPrefsLoaded(true);
      }
    }
    loadPrefs();
    return () => {
      isActive = false;
      controller.abort();
    };
  }, [session, isComingSoon, pack?.packLeague, pack?.linkedTeams]);

  async function handleNotifyClick(e) {
    try {
      if (e && typeof e.preventDefault === 'function') e.preventDefault();
      if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
    } catch {}
    // If not logged in, prompt login/signup
    if (!session?.user) {
      try {
        const league = pack?.packLeague || '';
        const teams = Array.isArray(pack?.linkedTeams) ? pack.linkedTeams : [];
        const series = pack?.series || (Array.isArray(pack?.seriesList) && pack.seriesList.length === 1 ? pack.seriesList[0] : null);
        const seriesList = Array.isArray(pack?.seriesList) ? pack.seriesList : [];
        openModal('login', {
          reason: 'notify',
          packTitle: pack?.packTitle || '',
          packURL: pack?.packURL || '',
          subscribeCategory: 'pack_open',
          subscribeLeague: league,
          subscribeTeams: teams,
          subscribeSeries: series,
          subscribeSeriesList: seriesList,
        });
      } catch {}
      return;
    }
    // Logged in: open Subscribe modal with league/teams/series choices
    try {
      setNotifyLoading(true);
      const league = pack?.packLeague || '';
      const teams = Array.isArray(pack?.linkedTeams) ? pack.linkedTeams : [];
      const series = pack?.series || (Array.isArray(pack?.seriesList) && pack.seriesList.length === 1 ? pack.seriesList[0] : null);
      const seriesList = Array.isArray(pack?.seriesList) ? pack.seriesList : [];
      openModal('subscribe', {
        category: 'pack_open',
        league,
        teams,
        series,
        seriesList,
        onSubscribed: () => {
          setWillNotify(true);
        },
      });
    } catch (_) {
    } finally {
      setNotifyLoading(false);
    }
  }

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

  // Removed individual pack notification flow (deprecated in favor of profile preferences)

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
            {Array.isArray(pack.seriesList) && pack.seriesList.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {pack.seriesList.slice(0, 3).map((s, idx) => (
                    <span
                      key={(s.id || s.series_id || String(idx))}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-indigo-300 text-xs text-indigo-800 bg-indigo-50"
                    >
                      <span>Series:</span>
                      <span className="font-medium">{s.title || s.series_id || 'Untitled'}</span>
                    </span>
                  ))}
                </div>
            )}
			{(pack?.creatorProfileHandle || pack?.creatorProfileId) && (
				<div className="mt-0.5 text-xs text-gray-500">
					<span>by </span>
					{pack.creatorProfileHandle ? (
						<Link href={`/profile/${pack.creatorProfileHandle}`} className="hover:underline">@{pack.creatorProfileHandle}</Link>
					) : (
						<span className="font-mono">{String(pack.creatorProfileId).slice(0, 8)}</span>
					)}
				</div>
			)}
			{(() => {
				const summary = (pack?.packSummary || "").toString().trim();
				if (!summary) return null;
				return (
					<p className="mt-1 text-xs md:text-sm text-gray-600 line-clamp-3">{summary}</p>
				);
			})()}
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
            {isComingSoon && prefsLoaded && willNotify && (
              <div className="mt-1 inline-flex items-center gap-1 bg-blue-50 text-blue-800 border border-blue-200 text-xs font-medium px-2 py-1 rounded">
                <span aria-hidden>🔔</span>
                <span>You'll be notified when this pack drops</span>
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
						{(() => {
							const stateLc = String(st?.state || '').toLowerCase();
							const hasStarted = stateLc === 'in' || stateLc === 'post';
							if (hasStarted && home && away) {
								return (
									<span>
										{away.abbreviation || away.name} {away.score}
										<span className="mx-1">@</span>
										{home.abbreviation || home.name} {home.score}
										{st?.shortDetail ? <span className="ml-2 text-gray-600">{st.shortDetail}</span> : null}
									</span>
								);
							}
							// Pre-game or unknown: show concise status only (e.g., scheduled time), no score
							if (st?.shortDetail) {
								return <span className="text-gray-600">{st.shortDetail}</span>;
							}
							return null;
						})()}
					</div>
							);
						})}
					</div>
				);
			})()}
			{propsCount > 0 && (
				<div className="mt-1 text-xs md:text-sm text-gray-700">
					{session?.user && userTakesCount > 0 ? (
						<span className="inline-flex items-center gap-1">
							<span className="font-medium text-green-600">{userTakesCount}</span>
							<span>of</span>
							<span>{propsCount}</span>
							<span>props completed</span>
						</span>
					) : (
						<span>{propsCount} {propsCount === 1 ? 'Prop' : 'Props'}</span>
					)}
				</div>
			)}
				{isOpenLike && (
				<div className="mt-1 text-sm text-gray-700">
						<span>🏟️ </span><Countdown targetTime={pillEventTime} />
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
								<div><span>🏟️ </span><Countdown targetTime={dropMs} /></div>
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
						onClick={(e) => { e.preventDefault(); e.stopPropagation(); const slug = pack.packURL || packID; openModal('sharePack', { packTitle: pack.packTitle, packSummary: pack.packSummary, packUrl: typeof window !== 'undefined' && slug ? `${window.location.origin}/packs/${slug}` : '', packLeague: pack.packLeague, packCloseTime: pack.packCloseTime, packOpenSmsTemplate: pack.packOpenSmsTemplate }); }}
						onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); const slug = pack.packURL || packID; openModal('sharePack', { packTitle: pack.packTitle, packSummary: pack.packSummary, packUrl: typeof window !== 'undefined' && slug ? `${window.location.origin}/packs/${slug}` : '', packLeague: pack.packLeague, packCloseTime: pack.packCloseTime, packOpenSmsTemplate: pack.packOpenSmsTemplate }); } }}
							className="inline-flex items-center justify-center px-2.5 py-1.5 md:px-3 md:py-2 rounded bg-gray-200 text-gray-900 text-xs md:text-sm font-medium hover:bg-gray-300"
						>
							Share
						</span>
					</div>
				)}
				{isComingSoon && (!prefsLoaded || !willNotify) && (
					<div className="mt-3 flex items-center gap-2">
						<button
							onClick={handleNotifyClick}
							disabled={notifyLoading}
							className={`inline-flex items-center justify-center px-2.5 py-1.5 md:px-3 md:py-2 rounded ${notifyLoading ? 'bg-gray-300 text-gray-600' : 'bg-blue-600 text-white hover:bg-blue-700'} text-xs md:text-sm font-medium`}
						>
							{notifyLoading ? 'Adding…' : 'Notify me when this Pack drops'}
						</button>
						<span
							role="button"
							tabIndex={0}
							onClick={(e) => { e.preventDefault(); e.stopPropagation(); const slug = pack.packURL || packID; openModal('sharePack', { packTitle: pack.packTitle, packSummary: pack.packSummary, packUrl: typeof window !== 'undefined' && slug ? `${window.location.origin}/packs/${slug}` : '', packLeague: pack.packLeague, packCloseTime: pack.packCloseTime, packOpenSmsTemplate: pack.packOpenSmsTemplate }); }}
							onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); const slug = pack.packURL || packID; openModal('sharePack', { packTitle: pack.packTitle, packSummary: pack.packSummary, packUrl: typeof window !== 'undefined' && slug ? `${window.location.origin}/packs/${slug}` : '', packLeague: pack.packLeague, packCloseTime: pack.packCloseTime, packOpenSmsTemplate: pack.packOpenSmsTemplate }); } }}
							className="inline-flex items-center justify-center px-2.5 py-1.5 md:px-3 md:py-2 rounded bg-gray-200 text-gray-900 text-xs md:text-sm font-medium hover:bg-gray-300"
						>
							Share
						</span>
					</div>
				)}
				{isComingSoon && prefsLoaded && willNotify && (
					<div className="mt-3 flex items-center gap-2">
						<span
							role="button"
							tabIndex={0}
							onClick={(e) => { e.preventDefault(); e.stopPropagation(); const slug = pack.packURL || packID; openModal('sharePack', { packTitle: pack.packTitle, packSummary: pack.packSummary, packUrl: typeof window !== 'undefined' && slug ? `${window.location.origin}/packs/${slug}` : '', packLeague: pack.packLeague, packCloseTime: pack.packCloseTime, packOpenSmsTemplate: pack.packOpenSmsTemplate }); }}
							onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); const slug = pack.packURL || packID; openModal('sharePack', { packTitle: pack.packTitle, packSummary: pack.packSummary, packUrl: typeof window !== 'undefined' && slug ? `${window.location.origin}/packs/${slug}` : '', packLeague: pack.packLeague, packCloseTime: pack.packCloseTime, packOpenSmsTemplate: pack.packOpenSmsTemplate }); } }}
							className="inline-flex items-center justify-center px-2.5 py-1.5 md:px-3 md:py-2 rounded bg-gray-200 text-gray-900 text-xs md:text-sm font-medium hover:bg-gray-300"
						>
							Share
						</span>
					</div>
				)}
				{!isOpenLike && !isComingSoon && (
					<div className="mt-3 flex items-center gap-2">
						<span
							role="button"
							tabIndex={0}
							onClick={(e) => { e.preventDefault(); e.stopPropagation(); const slug = pack.packURL || packID; openModal('sharePack', { packTitle: pack.packTitle, packSummary: pack.packSummary, packUrl: typeof window !== 'undefined' && slug ? `${window.location.origin}/packs/${slug}` : '', packLeague: pack.packLeague, packCloseTime: pack.packCloseTime, packOpenSmsTemplate: pack.packOpenSmsTemplate }); }}
							onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); const slug = pack.packURL || packID; openModal('sharePack', { packTitle: pack.packTitle, packSummary: pack.packSummary, packUrl: typeof window !== 'undefined' && slug ? `${window.location.origin}/packs/${slug}` : '', packLeague: pack.packLeague, packCloseTime: pack.packCloseTime, packOpenSmsTemplate: pack.packOpenSmsTemplate }); } }}
							className="inline-flex items-center justify-center px-2.5 py-1.5 md:px-3 md:py-2 rounded bg-gray-200 text-gray-900 text-xs md:text-sm font-medium hover:bg-gray-300"
						>
							Share
						</span>
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

	// Stable top-level wrapper to avoid SSR/CSR tag mismatches
	const wrapperClasses = `group w-full max-w-full border rounded shadow-sm bg-white overflow-hidden p-2 block text-black ${!isComingSoon ? 'transition-shadow hover:shadow-md' : ''} ${className}`;

	return (
		<div
			role="group"
			aria-label={(pack.packTitle || "Pack") + " preview"}
			aria-disabled={isComingSoon || disabled}
			className={wrapperClasses}
		>
			{isComingSoon ? (
				content
			) : (
				<Link
					href={targetHref}
					className="block"
					aria-disabled={disabled}
				>
					{content}
				</Link>
			)}
		</div>
	);
}
