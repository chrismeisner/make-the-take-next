// File: components/PackCarouselView.js

import React, { useState, useEffect, useRef } from "react";
import 'swiper/css';
import 'swiper/css/navigation';
import 'swiper/css/effect-cards';
// removed dot pagination CSS

import { Swiper, SwiperSlide } from 'swiper/react';
import { EffectCards, Mousewheel } from 'swiper/modules';
import CardViewCard from "./CardViewCard";
import InlineCardProgressFooter from "./InlineCardProgressFooter";
import LeaderboardTable from "./LeaderboardTable";
import Link from "next/link";
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

export default function PackCarouselView({ packData, leaderboard, debugLogs, userReceipts = [] }) {
  const { handleChoiceSelect } = usePackContext();
  const { openModal } = useModal();
  const [activeTab, setActiveTab] = useState('leaderboard');
  const [swiperReady, setSwiperReady] = useState(false);
  const [cardHeight, setCardHeight] = useState(0);
  const [currentSlide, setCurrentSlide] = useState(0);
  // SLIDE_HEIGHT_OFFSET: adjust this (in px) to extend slide container for pagination dots
  const SLIDE_HEIGHT_OFFSET = 64;
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
  // Total slides include 1 cover + N props
  const totalSlides = 1 + props.length;
  useEffect(() => {
    setIsClient(true);
  }, []);
  // Challenges UI temporarily removed
  // Add keyboard navigation for desktop: left/right arrows to switch cards
  useEffect(() => {
    const handleKey = (e) => {
      // Ignore if focus is on input, textarea, or editable elements
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable) return;
      // Arrow keys navigate cards
      if (e.key === 'ArrowLeft') {
        if (!swiperRef.current) return;
        const idx = swiperRef.current.activeIndex ?? 0;
        if (idx <= 0) swiperRef.current.slideTo(totalSlides - 1); else swiperRef.current.slidePrev();
        return;
      }
      if (e.key === 'ArrowRight') {
        if (!swiperRef.current) return;
        const idx = swiperRef.current.activeIndex ?? 0;
        if (idx >= totalSlides - 1) swiperRef.current.slideTo(0); else swiperRef.current.slideNext();
        return;
      }
      // Number keys select choice on current card
      if (e.key === '1' || e.key === '2') {
        // Use realIndex to ignore duplicated slides created by loop mode
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
  }, [handleChoiceSelect, packData.props, totalSlides]);
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
  // Start with server receipts only (ignore any userReceiptId in query)
  const initialReceipts = userReceipts;
  let allReceipts = [...initialReceipts];
  // Dedupe by receiptID, keeping the earliest createdTime
  const receiptIdToReceipt = {};
  allReceipts.forEach((receipt) => {
    if (!receiptIdToReceipt[receipt.receiptID] || new Date(receipt.createdTime) < new Date(receiptIdToReceipt[receipt.receiptID].createdTime)) {
      receiptIdToReceipt[receipt.receiptID] = receipt;
    }
  });
  allReceipts = Object.values(receiptIdToReceipt);
  // Compute currentReceiptId for downstream components (no UI rendering for receipts here)
  const hasReceipts = allReceipts.length > 0;
  const currentReceiptId = hasReceipts ? allReceipts[0].receiptID : null;

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
    if (!swiperRef.current) return;
    const idx = swiperRef.current.activeIndex ?? 0;
    if (idx >= totalSlides - 1) {
      swiperRef.current.slideTo(0);
    } else {
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
        {/* Mobile-only hero above prop stack */}
        <div className="block md:hidden px-2 mb-4">
          <h2 className="text-3xl font-bold">{packData.packTitle}</h2>
          <p className="text-gray-600">{packData.packSummary}</p>
          {packData.firstPlace && (
            <div className="mt-2 inline-flex items-center gap-1 bg-yellow-100 text-yellow-900 text-xs font-medium px-2 py-1 rounded">
              <span aria-hidden>🏆</span>
              <span>{packData.firstPlace}</span>
            </div>
          )}
          <div className="mt-3">
            <button
              type="button"
              onClick={() => openModal('sharePack', {
                packTitle: packData.packTitle,
                packSummary: packData.packSummary,
                packUrl: typeof window !== 'undefined' ? `${window.location.origin}/packs/${packData.packURL}` : `${debugLogs.origin}/packs/${packData.packURL}`,
              })}
              className="inline-flex items-center justify-center px-3 py-2 rounded bg-gray-200 text-gray-900 text-sm font-medium hover:bg-gray-300"
            >
              Share this pack
            </button>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {/* Left column wrapper: details + tabs */}
          <div className="order-2 md:order-1 flex flex-col space-y-6">
            {/* Desktop hero (hidden on mobile) */}
            <div className="hidden md:block px-2">
              <h2 className="text-3xl font-bold">{packData.packTitle}</h2>
              <p className="text-gray-600">{packData.packSummary}</p>
              {packData.firstPlace && (
                <div className="mt-2 inline-flex items-center gap-1 bg-yellow-100 text-yellow-900 text-xs font-medium px-2 py-1 rounded">
                  <span aria-hidden>🏆</span>
                  <span>{packData.firstPlace}</span>
                </div>
              )}
              <div className="mt-3">
                <button
                  type="button"
                  onClick={() => openModal('sharePack', {
                    packTitle: packData.packTitle,
                    packSummary: packData.packSummary,
                    packUrl: typeof window !== 'undefined' ? `${window.location.origin}/packs/${packData.packURL}` : `${debugLogs.origin}/packs/${packData.packURL}`,
                  })}
                  className="inline-flex items-center justify-center px-3 py-2 rounded bg-gray-200 text-gray-900 text-sm font-medium hover:bg-gray-300"
                >
                  Share this pack
                </button>
              </div>
              {Array.isArray(packData.contests) && packData.contests.length > 0 && (
                <div className="mt-2 text-sm text-gray-700">
                  <div className="font-medium">In contest{packData.contests.length > 1 ? 's' : ''}:</div>
                  <ul className="mt-1 space-y-1">
                    {packData.contests.map((c) => (
                      <li key={c.contestID}>
                        <Link href={`/contests/${c.contestID}`} className="text-blue-600 underline">
                          {c.contestTitle || c.contestID}
                        </Link>
                        {c.contestPrize ? (
                          <span className="ml-2 text-gray-500">({c.contestPrize})</span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="mt-2 flex flex-wrap text-sm text-gray-500 gap-4">
                {packData.packType === 'event' && packData.eventTime && (
                  <span>
                    Event: {packData.homeTeam?.teamNameFull} vs {packData.awayTeam?.teamNameFull} on {new Date(packData.eventTime).toLocaleString()}
                  </span>
                )}
                {packData.packCreatorID && (
                  <span>
                    Creator: {" "}
                    <Link
                      href={`/profile/${encodeURIComponent(packData.packCreatorID)}`}
                      className="text-blue-600 underline"
                    >
                      {packData.packCreatorID}
                    </Link>
                  </span>
                )}
              </div>
            </div>
            
            {/* Removed "Your receipts" section and copy/QR controls per requirements */}

            {/* Tabs moved inside left column wrapper to avoid affecting right column height */}
            <div className="px-2">
              <div className="border-b border-gray-200">
                <nav className="-mb-px flex space-x-4" aria-label="Tabs">
                  <button
                    onClick={() => setActiveTab('leaderboard')}
                    className={`py-2 px-1 text-sm font-medium border-b-2 ${activeTab === 'leaderboard' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
                  >
                    Leaderboard
                  </button>
                  <button
                    onClick={() => setActiveTab('content')}
                    className={`py-2 px-1 text-sm font-medium border-b-2 ${activeTab === 'content' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
                  >
                    Content
                  </button>
                </nav>
              </div>
              <div className="pt-4">
                {activeTab === 'leaderboard' ? (
                  <LeaderboardTable leaderboard={leaderboard} />
                ) : activeTab === 'content' ? (
                  Array.isArray(packData.contentData) && packData.contentData.length > 0 ? (
                    <ul className="space-y-3">
                      {packData.contentData.map((c) => (
                        <li key={c.airtableId} className="text-sm flex items-start gap-3 border rounded-md bg-white shadow-sm p-3">
                          {c.contentImage && (
                            <img
                              src={c.contentImage}
                              alt={c.contentTitle || 'Content image'}
                              className="w-16 h-16 object-cover rounded border border-gray-200 flex-shrink-0"
                              loading="lazy"
                            />
                          )}
                          <div className="min-w-0">
                            <a href={c.contentURL} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline break-words">
                              {c.contentTitle || c.contentURL}
                            </a>
                            {c.contentSource && (
                              <span className="ml-2 text-gray-500">({c.contentSource})</span>
                            )}
                            <div className="mt-1 flex flex-wrap items-center gap-2">
                              {c.spotify && (
                                <a href={c.spotify} target="_blank" rel="noopener noreferrer" className="px-2 py-1 rounded-full bg-green-600 text-white text-xs hover:bg-green-700">Spotify</a>
                              )}
                              {c.apple && (
                                <a href={c.apple} target="_blank" rel="noopener noreferrer" className="px-2 py-1 rounded-full bg-gray-800 text-white text-xs hover:bg-black">Apple</a>
                              )}
                              {c.youtube && (
                                <a href={c.youtube} target="_blank" rel="noopener noreferrer" className="px-2 py-1 rounded-full bg-red-600 text-white text-xs hover:bg-red-700">YouTube</a>
                              )}
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-gray-600">No content yet.</p>
                  )
                ) : null}
              </div>
            </div>
          </div>
          {/* Swiper and Inline Footer section (right column) */}
          <div className="order-1 md:order-2 flex justify-center">
            <div className="w-full max-w-[520px] mx-auto overflow-visible">
              {/* Narrower wrapper for the card stack */}
              <div className="mx-auto max-w-[420px] overflow-visible">
                <Swiper
                  initialSlide={initialSlide}
                  onSwiper={(swiper) => { swiperRef.current = swiper; setSwiperReady(true); setCurrentSlide(swiper.activeIndex || 0); }}
                  style={{ height: cardHeight ? `${cardHeight + SLIDE_HEIGHT_OFFSET}px` : 'auto' }}
                  className="pb-24 sm:pb-12"
                  modules={[EffectCards, Mousewheel]}
                  loop={false}
                  effect="cards"
                  grabCursor={true}
                  mousewheel={{ forceToAxis: true, thresholdDelta: 10, sensitivity: 0.5 }}
                  cardsEffect={{ slideShadows: false, perSlideOffset: 8 }}
                  onSlideChange={(swiper) => setCurrentSlide(swiper.activeIndex || 0)}
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
              <div className="mt-10 sm:mt-8 relative w-full flex items-center justify-center">
                <button type="button" onClick={() => {
                  if (!swiperRef.current) return;
                  const idx = swiperRef.current.activeIndex ?? 0;
                  if (idx <= 0) swiperRef.current.slideTo(totalSlides - 1); else swiperRef.current.slidePrev();
                }} className="absolute left-0 p-2">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <div className="flex justify-center w-full">
                  <span className="text-sm text-gray-600">
                    {(currentSlide ?? 0) === 0
                      ? 'Swipe to Play'
                      : `${currentSlide} of ${props.length}`}
                  </span>
                </div>
                <button type="button" onClick={() => {
                  if (!swiperRef.current) return;
                  const idx = swiperRef.current.activeIndex ?? 0;
                  if (idx >= totalSlides - 1) swiperRef.current.slideTo(0); else swiperRef.current.slideNext();
                }} className="absolute right-0 p-2">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
              <div className="mt-10 sm:mt-8">
                <InlineCardProgressFooter />
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* Removed bottom leaderboard & activity section - now moved into left column */}
    </>
  );
} 