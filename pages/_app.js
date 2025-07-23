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

export default function MyApp({ Component, pageProps: { session, ...pageProps } }) {
  console.log("[_app] Starting with session =>", session);

  return (
    // Keep session fresh every 5 minutes and on window focus
    <SessionProvider session={session} refetchInterval={300} refetchOnWindowFocus={true}>
   	<ModalProvider>
      <WireframeProvider>
		<Layout>
		  <Component {...pageProps} />
		  <GlobalModalRenderer />
		</Layout>
      </WireframeProvider>
	  </ModalProvider>
	</SessionProvider>
  );
}
