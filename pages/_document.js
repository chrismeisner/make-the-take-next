// pages/_document.js
import { Html, Head, Main, NextScript } from "next/document";

/**
 * Custom Document without global default Open Graph/Twitter meta tags.
 * This prevents conflicts with page-specific metadata.
 */
export default function MyDocument() {
  return (
	<Html lang="en">
	  <Head>
		{/* Remove global default OG/Twitter meta tags to allow each page to provide its own.
			Optionally, you may include other global tags here that don’t conflict with dynamic data. */}
	  </Head>
	  <body>
		<Main />
		<NextScript />
	  </body>
	</Html>
  );
}
