// File: /pages/packs/[packURL].js

import { useSession } from "next-auth/react";
import StickyProgressHeader from "../../components/StickyProgressHeader";
import PropCard from "../../components/PropCard";
import { PackContextProvider, usePackContext } from "../../contexts/PackContext";

/**
 * The top-level component just provides PackContext and fetches data server-side.
 */
export default function PackPage({ packData, leaderboard, debugLogs }) {
  // We wrap everything in <PackContextProvider> so child can access verifiedProps, etc.
  return (
	<PackContextProvider packData={packData}>
	  <PackInner packData={packData} leaderboard={leaderboard} debugLogs={debugLogs} />
	</PackContextProvider>
  );
}

/**
 * Child component: uses usePackContext() to know which props are verified,
 * sorts them so unverified appear at top, renders them, then shows the leaderboard.
 */
function PackInner({ packData, leaderboard, debugLogs }) {
  const { data: session } = useSession();
  const { verifiedProps } = usePackContext();

  if (!packData) {
	return <div className="text-red-600 p-4">No pack data found (404).</div>;
  }

  // Log server-side logs in client console for debugging
  if (debugLogs && typeof window !== "undefined") {
	console.log("[PackInner] debugLogs =>", debugLogs);
  }

  const {
	packTitle,
	props,
	packPrize,
	packPrizeImage,
	prizeSummary,
	packPrizeURL,
  } = packData;

  // Sort: unverified => top, verified => bottom
  const sortedProps = [...props].sort((a, b) => {
	const aVerified = verifiedProps.has(a.propID);
	const bVerified = verifiedProps.has(b.propID);
	if (aVerified === bVerified) return 0; // both same => no change
	return aVerified ? 1 : -1; // unverified => -1 => top
  });

  return (
	<>
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

		<p className="text-sm text-gray-600 mb-4">
		  Pack detail route: <span className="italic">/packs/[packURL]</span>
		</p>

		{sortedProps.length === 0 ? (
		  <p className="text-gray-600">No propositions found for this pack.</p>
		) : (
		  <div className="space-y-6">
			{sortedProps.map((prop) => (
			  <PropCard key={prop.propID} prop={prop} />
			))}
		  </div>
		)}

		{/* Render the pack-specific leaderboard at the bottom */}
		<PackLeaderboard leaderboard={leaderboard} />
	  </div>
	</>
  );
}

/**
 * Subcomponent to display the pack leaderboard at the bottom.
 */
function PackLeaderboard({ leaderboard }) {
  return (
	<div className="mt-8 pt-4 border-t border-gray-300">
	  <h2 className="text-xl font-bold mb-2">Leaderboard for This Pack</h2>
	  {(!leaderboard || leaderboard.length === 0) ? (
		<p>No participants yet.</p>
	  ) : (
		<table className="w-full border-collapse">
		  <thead>
			<tr className="border-b">
			  <th className="text-left py-2 px-3">Phone</th>
			  <th className="text-left py-2 px-3">Takes</th>
			  <th className="text-left py-2 px-3">Points</th>
			  <th className="text-left py-2 px-3">Record</th>
			</tr>
		  </thead>
		  <tbody>
			{leaderboard.map((item) => (
			  <tr key={item.phone} className="border-b">
				<td className="py-2 px-3">
				  {item.profileID ? (
					<a
					  href={`/profile/${item.profileID}`}
					  className="text-blue-600 underline"
					>
					  {obscurePhone(item.phone)}
					</a>
				  ) : (
					obscurePhone(item.phone)
				  )}
				</td>
				<td className="py-2 px-3">{item.count}</td>
				<td className="py-2 px-3">{Math.round(item.points)}</td>
				<td className="py-2 px-3">
				  {item.won}-{item.lost}
				</td>
			  </tr>
			))}
		  </tbody>
		</table>
	  )}
	</div>
  );
}

function obscurePhone(e164Phone) {
  const stripped = e164Phone.replace(/\D/g, "");
  let digits = stripped;
  if (digits.startsWith("1") && digits.length === 11) {
	digits = digits.slice(1);
  }
  if (digits.length !== 10) {
	return e164Phone; // fallback
  }
  const area = digits.slice(0, 3);
  const middle = digits.slice(3, 6);
  return `(${area}) ${middle} ****`;
}

/**
 * Standard SSR to fetch pack data + leaderboard
 */
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

  // If we got nothing, return 404
  if (!packData) {
	console.log("[PackPage] => packData is null => 404");
	return { notFound: true };
  }

  // 3) Fetch the pack-specific leaderboard from /api/leaderboard?packURL=...
  let leaderboard = [];
  try {
	const lbUrl = `${origin}/api/leaderboard?packURL=${encodeURIComponent(packURL)}`;
	console.log("[PackPage] fetching pack leaderboard =>", lbUrl);
	const lbResp = await fetch(lbUrl);
	const lbData = await lbResp.json();
	if (lbData.success) {
	  leaderboard = lbData.leaderboard || [];
	} else {
	  console.log("[PackPage] could not load leaderboard =>", lbData.error);
	}
  } catch (err) {
	console.error("[PackPage] error fetching leaderboard =>", err);
  }

  // 4) Return the pack data, leaderboard, plus any debug logs you want the client to see
  const debugLogs = {
	packURL,
	origin,
	packDataReceived: !!packData,
	leaderboardCount: leaderboard.length,
  };

  return {
	props: {
	  packData,
	  leaderboard,
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
	  console.log("[fetchPackByURL] response not OK =>", response.status);
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
