// File: components/PackCarouselView.js

import React, { useState, useEffect, useRef } from "react";
import 'swiper/css';
import 'swiper/css/navigation';
import 'swiper/css/effect-cards';
import 'swiper/css/pagination';

import { Swiper, SwiperSlide } from 'swiper/react';
import { EffectCards, Pagination } from 'swiper/modules';
import CardViewCard from "./CardViewCard";
import InlineCardProgressFooter from "./InlineCardProgressFooter";
import LeaderboardTable from "./LeaderboardTable";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { usePackContext } from "../contexts/PackContext";
import { useRouter } from "next/router";
import { useModal } from "../contexts/ModalContext";

// Add a swipeable cover card as the first slide
function PackCoverCard({ packCover, packTitle, onImgLoad, onClick }) {
  return (
    <div className="w-full max-w-[600px] aspect-square mx-auto border border-gray-300 rounded-lg shadow-lg overflow-hidden">
      {packCover && packCover.length > 0 ? (
        <img
          src={packCover[0].url}
          alt={packTitle}
          onLoad={onImgLoad}
          onClick={onClick}
          className="w-full h-full object-cover rounded-lg cursor-pointer"
        />
      ) : (
        <div className="bg-gray-200 w-full h-full flex items-center justify-center">
          <h2 className="text-gray-700 text-xl">{packTitle}</h2>
        </div>
      )}
    </div>
  );
}

export default function PackCarouselView({ packData, leaderboard, debugLogs, userReceipts = [], activity = [] }) {
  // Only show receipts section when user is authenticated
  const { data: session } = useSession();
  const { handleChoiceSelect } = usePackContext();
  const { openModal } = useModal();
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState('leaderboard');
  const [swiperReady, setSwiperReady] = useState(false);
  const [cardHeight, setCardHeight] = useState(0);
  // SLIDE_HEIGHT_OFFSET: adjust this (in px) to extend slide container for pagination dots
  const SLIDE_HEIGHT_OFFSET = 64;
  console.log('[PackCarouselView] activity prop:', activity);
  const { props } = packData;
  const swiperRef = useRef(null);
  const router = useRouter();
  // Read 'prop' param from URL to set initial carousel slide (0 = cover, 1 = first prop, etc.)
  const propParam = router.query.prop;
  const initialSlide = (() => {
    if (!propParam) return 0;
    const val = Array.isArray(propParam) ? propParam[0] : propParam;
    const idx = parseInt(val, 10);
    return isNaN(idx) || idx < 0 ? 0 : idx;
  })();
  const [isClient, setIsClient] = useState(false);
  useEffect(() => {
    setIsClient(true);
  }, []);
  // Stores an array of { challenge, takes } objects
  const [acceptedTakes, setAcceptedTakes] = useState([]);
  const [loadingChallenges, setLoadingChallenges] = useState(false);
  const [errorChallenges, setErrorChallenges] = useState(null);

  // Fetch all challenges when 'Challenges' tab is active
  useEffect(() => {
    if (activeTab !== 'challenges') return;
    const initiatorProfileID = session?.user?.profileID;
    if (!initiatorProfileID) return;
    setLoadingChallenges(true);
    setErrorChallenges(null);
    (async () => {
      try {
        const res = await fetch(
          `/api/challenges?packURL=${encodeURIComponent(packData.packURL)}`
        );
        const data = await res.json();
        if (!data.success) throw new Error(data.error);
        const raw = data.challenges || [];
        // include challenges where user is initiator or challenger, and has been accepted
        const accepted = raw.filter(r => {
          const initiatorIDs = r.fields.initiatorProfileID || [];
          const challengerIDs = r.fields.challengerProfileID || [];
          const isInitiator = initiatorIDs.includes(initiatorProfileID);
          const isChallenger = challengerIDs.includes(initiatorProfileID);
          return r.fields.challengerReceiptID && (isInitiator || isChallenger);
        });
      // fetch both initiator and challenger takes for each challenge
      const entries = await Promise.all(
        accepted.map(async (r) => {
          const isInitiator = (r.fields.initiatorProfileID || []).includes(initiatorProfileID);
          const entry = { challenge: r, initiatorTakes: [], challengerTakes: [], isInitiator };
          // initiator's takes
          try {
            const ires = await fetch(`/api/takes/${encodeURIComponent(r.fields.initiatorReceiptID)}`);
            const idata = await ires.json();
            if (idata.success) entry.initiatorTakes = idata.takes;
            else console.error('[PackCarouselView] initiator fetch error:', idata.error);
          } catch (ie) {
            console.error('[PackCarouselView] initiator exception:', ie);
          }
          // challenger's takes
          try {
            const cres = await fetch(`/api/takes/${encodeURIComponent(r.fields.challengerReceiptID)}`);
            const cdata = await cres.json();
            if (cdata.success) entry.challengerTakes = cdata.takes;
            else console.error('[PackCarouselView] challenger fetch error:', cdata.error);
          } catch (ce) {
            console.error('[PackCarouselView] challenger exception:', ce);
          }
          return entry;
        })
      );
        setAcceptedTakes(entries);
      } catch (err) {
        setErrorChallenges(err.message);
      } finally {
        setLoadingChallenges(false);
      }
    })();
  }, [activeTab, packData.packURL, session?.user?.profileID]);
  // Add keyboard navigation for desktop: left/right arrows to switch cards
  useEffect(() => {
    const handleKey = (e) => {
      // Ignore if focus is on input, textarea, or editable elements
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable) return;
      // Arrow keys navigate cards
      if (e.key === 'ArrowLeft') {
        swiperRef.current?.slidePrev();
        return;
      }
      if (e.key === 'ArrowRight') {
        swiperRef.current?.slideNext();
        return;
      }
      // Number keys select choice on current card
      if (e.key === '1' || e.key === '2') {
        const idx = swiperRef.current?.activeIndex;
        // Skip the cover slide at index 0
        if (typeof idx === 'number' && idx > 0 && idx <= packData.props.length) {
          const prop = packData.props[idx - 1];
          const side = e.key === '1' ? 'A' : 'B';
          console.log(`[PackCarouselView] Key '${e.key}' pressed: selecting side ${side} for propID=${prop.propID}`);
          handleChoiceSelect(prop.propID, side);
        }
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [handleChoiceSelect, packData.props]);
  // Countdown timer for event
  const [timeLeft, setTimeLeft] = useState(() => {
    if (!packData.eventTime) return null;
    return new Date(packData.eventTime).getTime() - Date.now();
  });
  useEffect(() => {
    if (!packData.eventTime) return;
    const target = new Date(packData.eventTime).getTime();
    const updateTimer = () => {
      const diff = target - Date.now();
      setTimeLeft(diff);
    };
    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [packData.eventTime]);
 
  // Compute and apply a uniform card height across all slides
  const adjustCardHeight = () => {
    if (!swiperRef.current) return;
    // Only apply equal heights on narrow (mobile) viewports
    if (window.innerWidth >= 768) {
      setCardHeight(0);
      return;
    }
    const slideEls = swiperRef.current.el.querySelectorAll('.swiper-slide');
    let maxH = 0;
    slideEls.forEach((slide) => {
      const content = slide.firstElementChild;
      if (content) {
        const h = content.getBoundingClientRect().height;
        if (h > maxH) maxH = h;
      }
    });
    setCardHeight(maxH);
  };
  useEffect(() => {
    if (!swiperReady) return;
    // Delay slightly to allow images/text to render
    const timer = setTimeout(adjustCardHeight, 100);
    window.addEventListener('resize', adjustCardHeight);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', adjustCardHeight);
    };
  }, [swiperReady, props]);
  function formatTime(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    if (totalSeconds <= 0) return '';
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const parts = [];
    if (days) parts.push(`${days}d`);
    if (hours) parts.push(`${hours}h`);
    if (minutes) parts.push(`${minutes}m`);
    parts.push(`${seconds}s`);
    return parts.join(' ');
  }
  const fallback = router.query.userReceiptId;
  // Start with server receipts and optionally include the latest fallback
  const initialReceipts = userReceipts;
  let allReceipts = [...initialReceipts];
  if (fallback) {
    allReceipts.push({ receiptID: fallback, createdTime: new Date().toISOString() });
  }
  // Dedupe by receiptID, keeping the earliest createdTime
  const receiptMap = {};
  allReceipts.forEach((r) => {
    if (!receiptMap[r.receiptID] || new Date(r.createdTime) < new Date(receiptMap[r.receiptID].createdTime)) {
      receiptMap[r.receiptID] = r;
    }
  });
  allReceipts = Object.values(receiptMap);
  // Prepare share link for the first receipt
  const hasReceipts = session?.user && allReceipts.length > 0;
  const currentReceiptId = hasReceipts ? allReceipts[0].receiptID : null;
  const shareUrl = hasReceipts ? `${debugLogs.origin}/packs/${packData.packURL}?ref=${currentReceiptId}` : "";
  const fallbackCopyTextToClipboard = (text) => {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.top = '0';
    textArea.style.left = '0';
    textArea.style.width = '2em';
    textArea.style.height = '2em';
    textArea.style.padding = '0';
    textArea.style.border = 'none';
    textArea.style.outline = 'none';
    textArea.style.boxShadow = 'none';
    textArea.style.background = 'transparent';
    document.body.appendChild(textArea);
    textArea.select();
    try { document.execCommand('copy'); } catch (err) { console.error('Fallback: unable to copy', err); }
    document.body.removeChild(textArea);
  };

  // Add console logs for team URLs
  useEffect(() => {
    if (packData.homeTeam?.teamSlug) {
      console.log('Home team URL:', `/teams/${packData.homeTeam.teamSlug}`);
    } else {
      console.log('No home team slug available');
    }
    if (packData.awayTeam?.teamSlug) {
      console.log('Away team URL:', `/teams/${packData.awayTeam.teamSlug}`);
    } else {
      console.log('No away team slug available');
    }
  }, [packData.homeTeam?.teamSlug, packData.awayTeam?.teamSlug]);

  const handleCoverClick = () => {
    if (swiperRef.current) {
      swiperRef.current.slideNext();
    }
  };

  if (props.length === 0) {
    return (
      <p className="text-gray-600">
        No propositions found for this pack.
      </p>
    );
  }

  return (
    <>
      {/* Removed sticky footer; using inline footer below pagination */}
      <div className="p-4 overflow-x-visible pb-32 md:pb-24">
        <div className="grid grid-cols-1 md:grid-cols-2 md:grid-rows-2 gap-2">
          <div className="space-y-6">
            {/* Pack details header */}
            <div className="px-4 sm:px-0">
              <h2 className="text-3xl font-bold">{packData.packTitle}</h2>
              <p className="text-gray-600">{packData.packSummary}</p>
              <div className="mt-2 flex flex-wrap text-sm text-gray-500 gap-4">
                <span>Type: {packData.packType}</span>
                {packData.packType === 'event' && packData.eventTime && (
                  <span className="inline-flex flex-col sm:flex-row sm:items-center gap-2">
                    <span>
                      Event: {packData.homeTeam?.teamNameFull} vs {packData.awayTeam?.teamNameFull} on {new Date(packData.eventTime).toLocaleString()}
                    </span>
                    {isClient && (
                      <span>
                        {timeLeft > 0
                          ? `Starts in ${formatTime(timeLeft)}`
                          : 'The event has started'}
                      </span>
                    )}
                  </span>
                )}
                {packData.packCreatorID && <span>Creator: {packData.packCreatorID}</span>}
              </div>
            </div>
            {packData.homeTeam?.teamSlug && packData.awayTeam?.teamSlug && (
              <p className="mt-2 text-sm px-4 sm:px-0">
                Teams: {packData.homeTeam.teamNameFull} vs {packData.awayTeam.teamNameFull}
              </p>
            )}
            {packData.homeTeam?.teamSlug && packData.awayTeam?.teamSlug && (
              <div className="mt-2 text-sm px-4 sm:px-0 flex space-x-4">
                <Link href={`/teams/${packData.homeTeam.teamSlug}`} className="text-blue-600 hover:underline">
                  View {packData.homeTeam.teamNameFull} details
                </Link>
                <Link href={`/teams/${packData.awayTeam.teamSlug}`} className="text-blue-600 hover:underline">
                  View {packData.awayTeam.teamNameFull} details
                </Link>
              </div>
            )}
            {session?.user && allReceipts.length > 0 && (
              <div className="px-4 sm:px-0 mt-4">
                <span className="font-semibold">Your receipts:</span>
                <ul className="mt-1 space-y-1">
                  {allReceipts.map(({ receiptID, createdTime }) => (
                    <li key={receiptID} className="flex justify-between items-center">
                      <Link href={`/packs/${packData.packURL}/${receiptID}`} className="underline text-blue-600">
                        {receiptID}
                      </Link>
                      <span className="text-sm text-gray-500">
                        {new Date(createdTime).toLocaleString()}
                      </span>
                    </li>
                  ))}
                </ul>
                {/* Removed original copy link component; use Share & QR buttons below */}
                {/* Share & QR buttons */}
                <div className="flex space-x-2 mt-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (navigator.clipboard && navigator.clipboard.writeText) {
                        navigator.clipboard.writeText(shareUrl)
                          .then(() => setCopied(true))
                          .catch(() => fallbackCopyTextToClipboard(shareUrl));
                      } else {
                        fallbackCopyTextToClipboard(shareUrl);
                      }
                      setTimeout(() => setCopied(false), 2000);
                    }}
                    className={`px-3 py-1 rounded text-white text-sm ${copied ? 'bg-gray-500' : 'bg-blue-600'}`}
                  >
                    {copied ? 'Copied!' : 'Copy Link'}
                  </button>
                  <button
                    type="button"
                    onClick={() => openModal('qrCode', { url: shareUrl })}
                    className="px-3 py-1 bg-gray-700 text-white text-sm rounded"
                  >
                    Generate QR
                  </button>
                </div>
              </div>
            )}
          </div>
          {/* Swiper and Inline Footer section */}
          <div className="md:col-start-2 md:row-span-2 flex justify-center">
            <div className="w-full max-w-[520px] mx-auto overflow-visible">
              {/* Narrower wrapper for the card stack */}
              <div className="mx-auto max-w-[420px] overflow-visible">
                <Swiper
                  initialSlide={initialSlide}
                  onSwiper={(swiper) => { swiperRef.current = swiper; setSwiperReady(true); }}
                  style={{ height: cardHeight ? `${cardHeight + SLIDE_HEIGHT_OFFSET}px` : 'auto' }}
                  className="pb-20 sm:pb-8"
                  modules={[EffectCards, Pagination]}
                  pagination={{ clickable: true, type: 'bullets', el: '.pack-pagination' }}
                  effect="cards"
                  grabCursor={true}
                  cardsEffect={{ slideShadows: false, perSlideOffset: 8 }}
                >
                  {/* First slide: Pack Cover */}
                  <SwiperSlide key="cover" style={{ height: cardHeight ? `${cardHeight + SLIDE_HEIGHT_OFFSET}px` : 'auto' }}>
                    <PackCoverCard packCover={packData.packCover} packTitle={packData.packTitle} onImgLoad={adjustCardHeight} onClick={handleCoverClick} />
                  </SwiperSlide>
                  {props.map((prop) => (
                    <SwiperSlide key={prop.propID} style={{ height: cardHeight ? `${cardHeight + SLIDE_HEIGHT_OFFSET}px` : 'auto' }}>
                      <CardViewCard prop={prop} currentReceiptId={currentReceiptId} />
                    </SwiperSlide>
                  ))}
                </Swiper>
              </div>
              <div className="mt-8 sm:mt-6 relative w-full flex items-center justify-center">
                <button type="button" onClick={() => swiperRef.current && swiperRef.current.slidePrev()} className="absolute left-0 p-2">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <div className="pack-pagination flex justify-center w-full" />
                <button type="button" onClick={() => swiperRef.current && swiperRef.current.slideNext()} className="absolute right-0 p-2">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
              <InlineCardProgressFooter />
            </div>
          </div>
          {/* Tabs for Leaderboard, Activity, Prizes, and Challengers */}
          <div className="px-4 sm:px-0">
            <div className="border-b border-gray-200">
              <nav className="-mb-px flex space-x-4" aria-label="Tabs">
                <button
                  onClick={() => setActiveTab('leaderboard')}
                  className={`py-2 px-1 text-sm font-medium border-b-2 ${activeTab === 'leaderboard' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
                >
                  Leaderboard
                </button>
                <button
                  onClick={() => setActiveTab('activity')}
                  className={`py-2 px-1 text-sm font-medium border-b-2 ${activeTab === 'activity' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
                >
                  Activity
                </button>
                <button
                  onClick={() => setActiveTab('prizes')}
                  className={`py-2 px-1 text-sm font-medium border-b-2 ${activeTab === 'prizes' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
                >
                  Prizes
                </button>
                {/* Added Challenges tab */}
                <button
                  onClick={() => setActiveTab('challenges')}
                  className={`py-2 px-1 text-sm font-medium border-b-2 ${activeTab === 'challenges' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
                >
                  Challenges
                </button>
              </nav>
            </div>
            <div className="pt-4">
              {activeTab === 'leaderboard' ? (
                <LeaderboardTable leaderboard={leaderboard} />
              ) : activeTab === 'activity' ? (
                <ul className="space-y-2">
                  {activity.map((act) => (
                    <li key={act.id} className="text-sm text-gray-700">
                      <span className="font-medium">{act.profileID}</span> took <span className="italic">{act.propTitle}</span> – {new Date(act.createdTime).toLocaleString()}
                    </li>
                  ))}
                </ul>
              ) : activeTab === 'prizes' ? (
                <p className="text-gray-500">Prizes content coming soon.</p>
              ) : activeTab === 'challenges' ? (
                !hasReceipts ? (
                  <p className="text-gray-500">Make your takes on this pack to challenge your friends.</p>
                ) : loadingChallenges ? (
                  <p>Loading challenges…</p>
                ) : errorChallenges ? (
                  <p className="text-red-500">Error: {errorChallenges}</p>
                ) : acceptedTakes.length === 0 ? (
                  <p className="text-gray-500">No accepted challenges found.</p>
                ) : (
                  <ul className="space-y-6">
                    {acceptedTakes.map(({ challenge, initiatorTakes, challengerTakes, isInitiator }) => {
                      // determine which side is 'you' and opponent
                      const myTakes = isInitiator ? initiatorTakes : challengerTakes;
                      const theirTakes = isInitiator ? challengerTakes : initiatorTakes;
                      const opponentName = isInitiator
                        ? challenge.fields.challengerProfileID?.[0]
                        : challenge.fields.initiatorProfileID?.[0];
                      return (
                      <li key={challenge.id}>
                        <div className="font-bold mb-2">
                          Challenge ID: {challenge.fields.challengeID || challenge.id}
                        </div>
                        <Link
                          href={`/challenges/${challenge.fields.challengeID || challenge.id}`}
                          className="text-sm text-blue-600 underline mb-2 block"
                        >
                          View challenge details
                        </Link>
                        <div className="mb-2">
                          <div className="font-semibold">Your takes:</div>
                          <ul className="pl-4 list-disc space-y-1">
                            {myTakes.map((t) => (
                              <li key={t.id} className="text-sm">
                                {t.propTitle}: <em>{t.propSide === 'A' ? t.propSideAShort : t.propSideBShort}</em>
                              </li>
                            ))}
                          </ul>
                        </div>
                        <div>
                          <div className="font-semibold">{opponentName || 'Opponent'}'s takes:</div>
                          <ul className="pl-4 list-disc space-y-1">
                            {theirTakes.map((t) => (
                              <li key={t.id} className="text-sm">
                                {t.propTitle}: <em>{t.propSide === 'A' ? t.propSideAShort : t.propSideBShort}</em>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </li>
                      );
                    })}
                  </ul>
                )
              ) : null}
            </div>
          </div>
        </div>
      </div>
      {/* Removed bottom leaderboard & activity section - now moved into left column */}
    </>
  );
} 