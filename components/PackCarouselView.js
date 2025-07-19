// File: components/PackCarouselView.js

import React from "react";
import 'swiper/css';
import 'swiper/css/navigation';
import 'swiper/css/effect-cards';

import { Swiper, SwiperSlide } from 'swiper/react';
import { Navigation, EffectCards } from 'swiper/modules';
import CardViewCard from "./CardViewCard";
import CardProgressFooter from "./CardProgressFooter";

export default function PackCarouselView({ packData }) {
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

      <Swiper
        modules={[Navigation, EffectCards]}
        effect="cards"
        grabCursor={true}
        navigation
        cardsEffect={{ slideShadows: false, perSlideOffset: 4 }}
        style={{ width: '100%', height: '80vh' }}
      >
        {props.map((prop) => (
          <SwiperSlide key={prop.propID}>
            <CardViewCard prop={prop} />
          </SwiperSlide>
        ))}
      </Swiper>
      <div className="pb-32" />
    </>
  );
} 