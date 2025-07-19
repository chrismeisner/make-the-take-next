// File: /pages/_app.js

import "../styles/globals.css";
import 'swiper/css';
import 'swiper/css/navigation';
import 'swiper/css/effect-cards';
import { SessionProvider } from "next-auth/react";
import Layout from "../components/Layout";
import { ModalProvider } from "../contexts/ModalContext";
import GlobalModalRenderer from "../components/GlobalModalRenderer";

export default function MyApp({ Component, pageProps: { session, ...pageProps } }) {
  console.log("[_app] Starting with session =>", session);

  return (
	<SessionProvider session={session}>
	  <ModalProvider>
		<Layout>
		  <Component {...pageProps} />
		  <GlobalModalRenderer />
		</Layout>
	  </ModalProvider>
	</SessionProvider>
  );
}
