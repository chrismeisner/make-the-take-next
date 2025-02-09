// File: /pages/packs/[packURL].js

import { useSession } from "next-auth/react";
import StickyProgressHeader from "../../components/StickyProgressHeader";
import PropCard from "../../components/PropCard";
import { PackContextProvider } from "../../contexts/PackContext";

export default function PackPage({ packData }) {
  const { data: session } = useSession();

  if (!packData) {
	return <div className="text-red-600 p-4">No pack data found.</div>;
  }

  // Destructure your new fields, as well as existing ones
  const {
	packTitle,
	props,
	packPrize,
	packPrizeImage,
	prizeSummary,
	packPrizeURL,
  } = packData;

  return (
	<PackContextProvider packData={packData}>
	  <StickyProgressHeader />

	  {/* Main container for the page */}
	  <div className="p-4 max-w-4xl mx-auto">
		<h1 className="text-2xl font-bold mb-2">{packTitle}</h1>

		{/* PRIZE SECTION */}
		<div className="flex items-center space-x-4 mb-4">
		  {/* Show the first image from packPrizeImage if available */}
		  {packPrizeImage && packPrizeImage.length > 0 && (
			<img
			  src={packPrizeImage[0].url}
			  alt="Pack Prize"
			  className="w-16 h-16 object-cover rounded"
			/>
		  )}

		  {/* Pack Prize as a big, pulsing, purple link */}
		  <a
			href={packPrizeURL || "#"}
			target="_blank"
			rel="noopener noreferrer"
			className="text-xl font-extrabold text-purple-500 animate-pulse"
		  >
			{packPrize}
		  </a>
		</div>

		{/* Prize summary text */}
		{prizeSummary && (
		  <p className="text-sm text-gray-700 mb-6">{prizeSummary}</p>
		)}

		{/* Info about the pack URL, etc. */}
		<p className="text-sm text-gray-600 mb-4">
		  Pack URL: <span className="italic">/packs/[packURL]</span>
		</p>

		{/* If no props, display a message. Otherwise, list them */}
		{props.length === 0 ? (
		  <p className="text-gray-600">No propositions found for this pack.</p>
		) : (
		  <div className="space-y-6">
			{props.map((prop) => (
			  <PropCard key={prop.propID} prop={prop} />
			))}
		  </div>
		)}
	  </div>
	</PackContextProvider>
  );
}

export async function getServerSideProps(context) {
  const { packURL } = context.params;
  if (!packURL) {
	return { notFound: true };
  }
  const packData = await fetchPackByURL(packURL);
  if (!packData) {
	return { notFound: true };
  }
  return {
	props: {
	  packData,
	},
  };
}

/**
 * Example helper to fetch a pack (and new fields) by URL.
 * In production, you might query Airtable directly
 * or use an environment variable for the base URL.
 */
async function fetchPackByURL(packURL) {
  try {
	// Use an environment variable (SITE_URL) OR dynamically construct the URL.
	// Fallback to localhost when not set:
	const baseUrl = process.env.SITE_URL || "http://localhost:3000";

	const response = await fetch(`${baseUrl}/api/packs/${encodeURIComponent(packURL)}`);
	const data = await response.json();
	if (!response.ok || !data.success) {
	  return null;
	}
	return data.pack;
  } catch (error) {
	console.error("PackPage - Error fetching pack by URL:", error);
	return null;
  }
}
