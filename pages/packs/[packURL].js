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

  const { packTitle, props } = packData;

  return (
	<PackContextProvider packData={packData}>
	  <StickyProgressHeader />
	  {/* Main container with Tailwind classes */}
	  <div className="p-4 max-w-4xl mx-auto">
		<h1 className="text-2xl font-bold mb-2">{packTitle}</h1>
		<p className="text-sm text-gray-600 mb-4">
		  Pack URL: <span className="italic">/packs/[packURL]</span>
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
 * Example helper to fetch a pack by URL.
 * In production, you might want to query Airtable directly
 * or use an environment variable for the base URL.
 */
async function fetchPackByURL(packURL) {
  try {
	// For local dev: calling your local API route
	const response = await fetch(`http://localhost:3000/api/packs/${packURL}`);
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
