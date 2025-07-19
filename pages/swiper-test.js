import React from 'react';
import 'swiper/css';
import 'swiper/css/navigation';
import 'swiper/css/effect-cards';

import { Swiper, SwiperSlide } from 'swiper/react';
import { Navigation, EffectCards } from 'swiper/modules';

export default function SwiperTestPage() {
  return (
    <div style={{ padding: '2rem' }}>
      <h1>Swiper Test</h1>
      <Swiper
        modules={[Navigation, EffectCards]}
        effect="cards"
        grabCursor={true}
        navigation
        style={{ width: '300px', height: '300px' }}
      >
        <SwiperSlide>
          <div style={{
              background: '#eee',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            Slide 1
          </div>
        </SwiperSlide>
        <SwiperSlide>
          <div style={{
              background: '#ddd',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            Slide 2
          </div>
        </SwiperSlide>
        <SwiperSlide>
          <div style={{
              background: '#ccc',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            Slide 3
          </div>
        </SwiperSlide>
      </Swiper>
    </div>
  );
} 