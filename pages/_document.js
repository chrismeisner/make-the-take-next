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
		{/* Ensure proper responsive scaling on mobile devices */}
		<meta name="viewport" content="width=device-width, initial-scale=1" />
		{/* Global meta tags (if any) should not conflict with page-level meta tags */}
	  </Head>
	  <body>
		<Main />
		<NextScript />
	  </body>
	</Html>
  );
}
