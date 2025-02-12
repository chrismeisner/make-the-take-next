// File: /pages/packs/[packURL].js
import { useSession } from "next-auth/react";
import StickyProgressHeader from "../../components/StickyProgressHeader";
import PropCard from "../../components/PropCard";
import { PackContextProvider } from "../../contexts/PackContext";

export default function PackPage({ packData, debugLogs }) {
  const { data: session } = useSession();

  // Print out any server-side logs we included
  if (debugLogs && typeof window !== "undefined") {
	// Just so you can see them in the browser console as well
	console.log("[PackPage] debugLogs =>", debugLogs);
  }

  if (!packData) {
	return <div className="text-red-600 p-4">No pack data found (404).</div>;
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

		{/* Debugging: Show the URL param + mention we are in /packs/[packURL] */}
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
	console.log("[PackPage] No packURL provided in params => 404");
	return { notFound: true };
  }

  // 1) Build the origin string
  const proto = context.req.headers["x-forwarded-proto"] || "http";
  const host = context.req.headers["x-forwarded-host"] || context.req.headers.host;
  const fallbackOrigin = `${proto}://${host}`;
  const origin = process.env.SITE_URL || fallbackOrigin;

  console.log("[PackPage] getServerSideProps => packURL:", packURL);
  console.log("[PackPage] getServerSideProps => proto:", proto);
  console.log("[PackPage] getServerSideProps => host:", host);
  console.log("[PackPage] getServerSideProps => final origin:", origin);

  // 2) Fetch the pack data from your API route
  const packData = await fetchPackByURL(packURL, origin);

  // 3) If we got nothing, return notFound to trigger Next.js 404
  if (!packData) {
	console.log("[PackPage] getServerSideProps => packData is null => returning 404");
	return { notFound: true };
  }

  // 4) Return the pack data plus any debug logs you want the client to see
  const debugLogs = {
	packURL,
	origin,
	packDataReceived: !!packData,
  };

  return {
	props: {
	  packData,
	  debugLogs,
	},
  };
}

/**
 * Helper to fetch a pack (and new fields) by URL, using a dynamic origin.
 */
async function fetchPackByURL(packURL, origin) {
  try {
	const apiUrl = `${origin}/api/packs/${packURL}`;
	console.log("[fetchPackByURL] Calling =>", apiUrl);

	const response = await fetch(apiUrl);
	if (!response.ok) {
	  console.log("[fetchPackByURL]  response not OK =>", response.status);
	  return null;
	}
	const data = await response.json();
	if (!data.success) {
	  console.log("[fetchPackByURL] data.success = false =>", data.error);
	  return null;
	}
	return data.pack;
  } catch (error) {
	console.error("[fetchPackByURL] Error =>", error);
	return null;
  }
}
