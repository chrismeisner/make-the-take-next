// File: /pages/_app.js

import "../styles/globals.css";
import 'swiper/css';
import 'swiper/css/navigation';
import 'swiper/css/effect-cards';
import { SessionProvider } from "next-auth/react";
import Layout from "../components/Layout";
import { ModalProvider } from "../contexts/ModalContext";
import { WireframeProvider } from "../contexts/WireframeContext";
import GlobalModalRenderer from "../components/GlobalModalRenderer";
import Head from "next/head";
import GlobalQueryEffects from "../components/GlobalQueryEffects";

export default function MyApp({ Component, pageProps: { session, ...pageProps } }) {
  console.log("[_app] Starting with session =>", session);

  return (
    <>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <SessionProvider session={session}>
        <ModalProvider>
          <WireframeProvider>
            <Layout>
              <Component {...pageProps} />
              <GlobalQueryEffects />
              <GlobalModalRenderer />
            </Layout>
          </WireframeProvider>
        </ModalProvider>
      </SessionProvider>
    </>
  );
}
