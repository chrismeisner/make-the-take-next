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

	  <div className="p-4 max-w-4xl mx-auto">
		<h1 className="text-2xl font-bold mb-2">{packTitle}</h1>

		{/* Prize Section */}
		<div className="flex items-center space-x-4 mb-4">
		  {packPrizeImage && packPrizeImage.length > 0 && (
			<img
			  src={packPrizeImage[0].url}
			  alt="Pack Prize"
			  className="w-16 h-16 object-cover rounded"
			/>
		  )}
		  <a
			href={packPrizeURL || "#"}
			target="_blank"
			rel="noopener noreferrer"
			className="text-xl font-extrabold text-purple-500 animate-pulse"
		  >
			{packPrize}
		  </a>
		</div>

		{prizeSummary && (
		  <p className="text-sm text-gray-700 mb-6">{prizeSummary}</p>
		)}

		{/* Example: Display packURL (for debugging) */}
		<p className="text-sm text-gray-600 mb-4">
		  Pack detail route: <span className="italic">/packs/[packURL]</span>
		</p>

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

  // Dynamically build the base URL from the incoming request
  const protocol = context.req.headers["x-forwarded-proto"] || "http";
  const host = context.req.headers["x-forwarded-host"] || context.req.headers.host;
  const origin = `${protocol}://${host}`;

  const packData = await fetchPackByURL(packURL, origin);
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
 * Helper to fetch a pack (and new fields) by URL, using dynamic origin.
 */
async function fetchPackByURL(packURL, origin) {
  try {
	const response = await fetch(`${origin}/api/packs/${packURL}`);
	if (!response.ok) {
	  return null;
	}
	const data = await response.json();
	if (!data.success) {
	  return null;
	}
	return data.pack;
  } catch (error) {
	console.error("PackPage - Error fetching pack by URL:", error);
	return null;
  }
}
