// File: components/PackCarouselView.js

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import CardViewCard from "./CardViewCard";
import { usePackContext } from "../contexts/PackContext";
import CardProgressFooter from "./CardProgressFooter";
// Removed TinderCard; using Swiper.js for swipe gestures
import dynamic from 'next/dynamic';
const Swiper = dynamic(() => import('swiper/react').then((mod) => mod.Swiper), { ssr: false });
const SwiperSlide = dynamic(() => import('swiper/react').then((mod) => mod.SwiperSlide), { ssr: false });
import { Navigation, EffectCards } from 'swiper/modules';

export default function PackCarouselView({ packData }) {
  useEffect(() => {
    import('swiper')
      .then((mod) => {
        const version = mod.VERSION || (mod.default && mod.default.VERSION);
        console.log('[Swiper Checker] swiper version:', version);
      })
      .catch((err) => {
        console.error('[Swiper Checker] Failed to import swiper:', err);
      });
  }, []);
  const { props } = packData;
  const [index, setIndex] = useState(0);
  const swiperRef = useRef(null);
  const { verifiedProps } = usePackContext();
  const [showUnansweredOnly, setShowUnansweredOnly] = useState(false);
  const displayedProps = showUnansweredOnly
    ? props.filter((p) => !verifiedProps.has(p.propID))
    : props;

  // Removed manual fade and prev/next; using Swiper.js for navigation

  if (displayedProps.length === 0) {
    return (
      <p className="text-gray-600">
        {showUnansweredOnly
          ? "No unanswered propositions."
          : "No propositions found for this pack."}
      </p>
    );
  }

  const current = displayedProps[index];

  return (
    <>
      <div className="p-2 flex justify-center">
        <label className="inline-flex items-center space-x-2">
          <input
            type="checkbox"
            checked={showUnansweredOnly}
            onChange={() => {
              const newVal = !showUnansweredOnly;
              setShowUnansweredOnly(newVal);
              setIndex(0);
              swiperRef.current?.slideTo(0);
            }}
          />
          <span>Only show unanswered props</span>
        </label>
      </div>
      <CardProgressFooter />
      <div className="flex flex-col items-center">
        <Swiper
          modules={[Navigation, EffectCards]}
          effect="cards"
          cardsEffect={{ slideShadows: true }}
          grabCursor={true}
          slidesPerView={1}
          onSwiper={(swiper) => (swiperRef.current = swiper)}
          onSlideChange={(swiper) => setIndex(swiper.activeIndex)}
          navigation
          initialSlide={index}
          className="w-full max-w-lg"
        >
          {displayedProps.map((prop) => (
            <SwiperSlide key={prop.propID}>
              <div className="w-full">
                <CardViewCard prop={prop} />
                <div className="mt-2 text-sm">
                  <Link href={`/props/${prop.propID}`} className="text-blue-600 underline">
                    See prop detail
                  </Link>
                </div>
              </div>
            </SwiperSlide>
          ))}
        </Swiper>
        <div className="mt-2 text-sm text-gray-600">
          {index + 1} of {displayedProps.length}
        </div>
        <div className="flex justify-between w-full max-w-lg mt-4">
          <button
            onClick={() => swiperRef.current?.slidePrev()}
            disabled={index === 0}
            className="px-3 py-1 bg-gray-200 rounded disabled:opacity-50"
          >
            Previous
          </button>
          <button
            onClick={() => swiperRef.current?.slideNext()}
            disabled={index === displayedProps.length - 1}
            className="px-3 py-1 bg-gray-200 rounded disabled:opacity-50"
          >
            Next
          </button>
        </div>
        <div className="pb-32" />
      </div>
    </>
  );
} 