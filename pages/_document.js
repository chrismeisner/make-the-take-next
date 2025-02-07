// pages/_document.js
import { Html, Head, Main, NextScript } from "next/document";

export default function MyDocument() {
  return (
	<Html lang="en">
	  <Head>
		{/* Global defaults if a page doesn't override them */}
		<meta property="og:title" content="Make The Take (Global Default)" />
		<meta 
		  property="og:description" 
		  content="A default site description if none is provided." 
		/>
		<meta 
		  property="og:image" 
		  content="https://placehold.co/1200x630?text=DEFAULT+SITE+OG" 
		/>
		<meta property="og:type" content="website" />

		<meta name="twitter:card" content="summary_large_image" />
		<meta 
		  name="twitter:title" 
		  content="Make The Take (Global Default)" 
		/>
		<meta 
		  name="twitter:description" 
		  content="A default site description if none is provided." 
		/>
		<meta 
		  name="twitter:image" 
		  content="https://placehold.co/1200x630?text=DEFAULT+SITE+OG" 
		/>
	  </Head>
	  <body>
		<Main />
		<NextScript />
	  </body>
	</Html>
  );
}
