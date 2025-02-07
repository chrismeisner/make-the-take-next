import "../styles/globals.css";
import { SessionProvider } from "next-auth/react";
import Layout from "../components/Layout"; // Ensure Layout is applied

export default function MyApp({ Component, pageProps: { session, ...pageProps } }) {
  console.log("[_app] Starting with session =>", session);

  return (
	<SessionProvider session={session}>
	  <Layout>
		<Component {...pageProps} />
	  </Layout>
	</SessionProvider>
  );
}
