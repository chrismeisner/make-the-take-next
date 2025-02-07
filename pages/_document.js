// pages/_document.js
import { Html, Head, Main, NextScript } from "next/document";

export default function MyDocument() {
  return (
	<Html lang="en">
	  <Head>
		{/*
		  These meta tags will apply site-wide unless a page overrides them.
		  Adjust the content as you like (title, description, image, etc.)
		*/}
		<meta property="og:title" content="Make The Take - Default Title" />
		<meta
		  property="og:description"
		  content="Default description for the site if none is provided. Make your take now!"
		/>
		<meta
		  property="og:image"
		  content="https://placehold.co/1200x630?text=Default+OG+Image"
		/>
		<meta property="og:type" content="website" />

		{/* Optional: Twitter Card tags */}
		<meta name="twitter:card" content="summary_large_image" />
		<meta name="twitter:title" content="Make The Take - Default Title" />
		<meta
		  name="twitter:description"
		  content="Default description for the site if none is provided. Make your take now!"
		/>
		<meta
		  name="twitter:image"
		  content="https://placehold.co/1200x630?text=Default+Twitter+Image"
		/>
	  </Head>
	  <body>
		<Main />
		<NextScript />
	  </body>
	</Html>
  );
}
