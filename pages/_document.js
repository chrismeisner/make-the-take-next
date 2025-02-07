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
		{/* Global meta tags (if any) should not conflict with page-level meta tags */}
	  </Head>
	  <body>
		<Main />
		<NextScript />
	  </body>
	</Html>
  );
}
