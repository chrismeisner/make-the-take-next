// pages/_document.js
import { Html, Head, Main, NextScript } from "next/document";

export default function MyDocument() {
  return (
	<Html lang="en">
	  <Head>
		{/* Global default OG tags */}
		<meta property="og:title" content="Make The Take (Global Default)" />
		<meta
		  property="og:description"
		  content="Default site description. Make your take now!"
		/>
		<meta
		  property="og:image"
		  content="https://placehold.co/1200x630?text=Default+Site+Image"
		/>
		<meta property="og:type" content="website" />

		{/* Optional Twitter Card tags */}
		<meta name="twitter:card" content="summary_large_image" />
		<meta name="twitter:title" content="Make The Take (Global Default)" />
		<meta
		  name="twitter:description"
		  content="Default site description. Make your take now!"
		/>
		<meta
		  name="twitter:image"
		  content="https://placehold.co/1200x630?text=Default+Site+Image"
		/>
	  </Head>
	  <body>
		<Main />
		<NextScript />
	  </body>
	</Html>
  );
}
