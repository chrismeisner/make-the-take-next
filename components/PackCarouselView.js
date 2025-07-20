// File: components/PackCarouselView.js

import React from "react";
import 'swiper/css';
import 'swiper/css/navigation';
import 'swiper/css/effect-cards';
import 'swiper/css/pagination';

import { Swiper, SwiperSlide } from 'swiper/react';
import { EffectCards, Pagination } from 'swiper/modules';
import CardViewCard from "./CardViewCard";
import CardProgressFooter from "./CardProgressFooter";
import LeaderboardTable from "./LeaderboardTable";
import ChallengeFriendButton from "./ChallengeFriendButton";

export default function PackCarouselView({ packData, leaderboard }) {
  const { props } = packData;

  if (props.length === 0) {
    return (
      <p className="text-gray-600">
        No propositions found for this pack.
      </p>
    );
  }

  return (
    <>
      <CardProgressFooter />
      {/* moved header into left column */}
      <div className="p-4 overflow-hidden md:overflow-visible pb-16">
        <div className="flex flex-col md:flex-row md:justify-between gap-2">
          <div className="w-full md:w-[45%] space-y-6">
            {packData.packCover && packData.packCover.length > 0 && (
              <div className="flex justify-center">
                <div className="w-48 h-48 rounded-lg shadow-md overflow-visible">
                  <img
                    src={packData.packCover[0].url}
                    alt={packData.packTitle}
                    className="w-full h-full object-cover"
                  />
                </div>
              </div>
            )}
            {/* Pack details header */}
            <div className="px-4 sm:px-0">
              <h2 className="text-3xl font-bold">{packData.packTitle}</h2>
              <p className="text-gray-600">{packData.packSummary}</p>
              <div className="mt-2 flex flex-wrap text-sm text-gray-500 gap-4">
                <span>Type: {packData.packType}</span>
                {packData.packType === 'event' && packData.eventTime && (
                  <span>Event: {new Date(packData.eventTime).toLocaleString()}</span>
                )}
                {packData.packCreatorID && <span>Creator: {packData.packCreatorID}</span>}
              </div>
            </div>
          </div>
          <div className="w-full md:w-[45%]">
            <Swiper className="pb-8"
              modules={[EffectCards, Pagination]}
              pagination={{ clickable: true, type: 'bullets', el: '.pack-pagination' }}
              effect="cards"
              grabCursor={true}
              cardsEffect={{ slideShadows: false, perSlideOffset: 8 }}
            >
              {props.map((prop) => (
                <SwiperSlide key={prop.propID}>
                  <CardViewCard prop={prop} />
                </SwiperSlide>
              ))}
            </Swiper>
            <div className="pack-pagination mt-4 flex justify-center" />
          </div>
        </div>
      </div>
      {/* Pack leaderboard section */}
      <div className="p-4">
        <h3 className="text-2xl font-bold mb-2">Pack Leaderboard</h3>
        <LeaderboardTable leaderboard={leaderboard} />
        <ChallengeFriendButton packTitle={packData.packTitle} />
      </div>
    </>
  );
} 