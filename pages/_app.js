// pages/_app.js
import "../styles/globals.css"; // Global CSS is only imported in _app.js
import { SessionProvider } from "next-auth/react";
import Layout from "../components/Layout";

export default function MyApp({
  Component,
  pageProps: { session, ...pageProps },
}) {
  return (
	<SessionProvider session={session}>
	  <Layout>
		<Component {...pageProps} />
	  </Layout>
	</SessionProvider>
  );
}
