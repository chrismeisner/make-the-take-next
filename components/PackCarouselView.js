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
import { useRouter } from "next/router";
import ChallengeComponent from "./ChallengeComponent";

// Add a swipeable cover card as the first slide
function PackCoverCard({ packCover, packTitle }) {
  return (
    <div className="w-full max-w-[600px] aspect-square mx-auto border border-gray-300 rounded-lg shadow-lg overflow-hidden">
      {packCover && packCover.length > 0 ? (
        <img
          src={packCover[0].url}
          alt={packTitle}
          className="w-full h-full object-cover rounded-lg"
        />
      ) : (
        <div className="bg-gray-200 w-full h-full flex items-center justify-center">
          <h2 className="text-gray-700 text-xl">{packTitle}</h2>
        </div>
      )}
    </div>
  );
}

export default function PackCarouselView({ packData, leaderboard, userReceipts = [], activity = [] }) {
  // Only show receipts section when user is authenticated
  const { data: session } = useSession();
  const [activeTab, setActiveTab] = useState('leaderboard');
  console.log('[PackCarouselView] activity prop:', activity);
  const { props } = packData;
  const swiperRef = useRef(null);
  const router = useRouter();
  // Add keyboard navigation for desktop: left/right arrows to switch cards
  useEffect(() => {
    const handleKey = (e) => {
      // Ignore if focus is on input, textarea, or editable elements
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable) return;
      if (e.key === 'ArrowLeft') swiperRef.current?.slidePrev();
      if (e.key === 'ArrowRight') swiperRef.current?.slideNext();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);
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
      <div className="p-4 overflow-hidden md:overflow-visible pb-16">
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
                    <span>Event: {new Date(packData.eventTime).toLocaleString()}</span>
                    <span>
                      {timeLeft > 0
                        ? `Starts in ${formatTime(timeLeft)}`
                        : 'The event has started'}
                    </span>
                  </span>
                )}
                {packData.packCreatorID && <span>Creator: {packData.packCreatorID}</span>}
              </div>
            </div>
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
                <ChallengeComponent packUrl={packData.packURL} receiptId={allReceipts[0].receiptID} />
              </div>
            )}
          </div>
          {/* Swiper and Inline Footer section */}
          <div className="md:col-start-2 md:row-span-2 flex justify-center">
            <div className="w-full max-w-[520px] mx-auto">
              {/* Narrower wrapper for the card stack */}
              <div className="mx-auto max-w-[420px]">
                <Swiper
                  className="pb-8"
                  onSwiper={(swiper) => (swiperRef.current = swiper)}
                  modules={[EffectCards, Pagination]}
                  pagination={{ clickable: true, type: 'bullets', el: '.pack-pagination' }}
                  effect="cards"
                  grabCursor={true}
                  cardsEffect={{ slideShadows: false, perSlideOffset: 8 }}
                >
                  {/* First slide: Pack Cover */}
                  <SwiperSlide key="cover">
                    <PackCoverCard packCover={packData.packCover} packTitle={packData.packTitle} />
                  </SwiperSlide>
                  {props.map((prop) => (
                    <SwiperSlide key={prop.propID}>
                      <CardViewCard prop={prop} />
                    </SwiperSlide>
                  ))}
                </Swiper>
              </div>
              <div className="mt-6 relative w-full flex items-center justify-center">
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
          {/* Tabs for Leaderboard, Activity, and Prizes */}
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
              ) : (
                <p className="text-gray-500">Prizes content coming soon.</p>
              )}
            </div>
          </div>
        </div>
      </div>
      {/* Removed bottom leaderboard & activity section - now moved into left column */}
    </>
  );
} 