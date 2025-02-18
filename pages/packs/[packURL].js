// File: /pages/packs/[packURL].js

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import StickyProgressHeader from "../../components/StickyProgressHeader";
import PropCard from "../../components/PropCard";
import { PackContextProvider, usePackContext } from "../../contexts/PackContext";
import { useModal } from "../../contexts/ModalContext"; // Import our global modal hook

/**
 * The top-level component provides PackContext and fetches data server-side.
 */
export default function PackPage({ packData, leaderboard, debugLogs }) {
  return (
	<PackContextProvider packData={packData}>
	  <PackInner
		packData={packData}
		leaderboard={leaderboard}
		debugLogs={debugLogs}
	  />
	</PackContextProvider>
  );
}

/**
 * Child component: renders the pack detail.
 * It now displays the packCover (if available) at the top,
 * followed by the pack title, prize info, props list, and leaderboard.
 */
function PackInner({ packData, leaderboard, debugLogs }) {
  const { data: session } = useSession();
  const { verifiedProps } = usePackContext();
  const { openModal } = useModal();
  const [activityLogged, setActivityLogged] = useState(false); // Track activity logging state

  if (!packData) {
	return <div className="text-red-600 p-4">No pack data found (404).</div>;
  }

  // Debug logs (optional)
  if (debugLogs && typeof window !== "undefined") {
	console.log("[PackInner] debugLogs =>", debugLogs);
  }

  const {
	packTitle,
	packCover, // New: attachment field for the pack cover image
	packPrize,
	packPrizeImage,
	prizeSummary,
	packPrizeURL,
	props,
  } = packData;

  // Determine the cover image URL (first attachment from packCover)
  const coverImageUrl =
	packCover && packCover.length > 0 ? packCover[0].url : null;

  // NEW: Sort props by the new numeric field "propOrder" (lowest to highest)
  const sortedProps = [...props].sort(
	(a, b) => (a.propOrder || 0) - (b.propOrder || 0)
  );

  // Check if the logged-in user's profile lacks a favorite team.
  useEffect(() => {
	if (session?.user && session.user.profileID) {
	  async function checkFavoriteTeam() {
		try {
		  const res = await fetch(`/api/profile/${session.user.profileID}`);
		  const data = await res.json();
		  if (data.success && !data.profile.profileTeamData) {
			openModal("favoriteTeam", {
			  onTeamSelected: async (team) => {
				try {
				  const resp = await fetch("/api/updateTeam", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					credentials: "same-origin",
					body: JSON.stringify({ team }),
				  });
				  const result = await resp.json();
				  if (result.success) {
					console.log("Team updated successfully:", team);
				  } else {
					console.error("Error updating team:", result.error);
				  }
				} catch (error) {
				  console.error("Error updating team:", error);
				}
			  },
			});
		  }
		} catch (err) {
		  console.error("Error checking favorite team", err);
		}
	  }
	  checkFavoriteTeam();
	}
  }, [session, openModal]);

  // Optionally trigger the "packCompleted" modal when all props are verified.
  useEffect(() => {
	if (packData && packData.props.length > 0) {
	  if (verifiedProps.size === packData.props.length && !activityLogged) {
		// Only log the activity if it's the first time the pack is completed
		setActivityLogged(true); // Prevent re-triggering
		openModal("packCompleted", { packTitle });
		logActivity(); // Log the activity
	  }
	}
	// eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verifiedProps, packData, packTitle, openModal, activityLogged]);

  // Function to log the activity when the pack is completed
  const logActivity = async () => {
	if (!session?.user?.airtableId) {
	  console.error("No airtableId in session; cannot log activity.");
	  return;
	}

	try {
	  const response = await fetch("/api/activity", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
		  profileID: session.user.profileID,      // textual profile ID
		  packID: packData.packID,                // textual pack ID
		  airtableId: session.user.airtableId,    // native Airtable record ID
		}),
	  });
	  const data = await response.json();
	  if (data.success) {
		console.log("Activity logged successfully");
	  } else {
		console.error("Error logging activity:", data.error);
	  }
	} catch (err) {
	  console.error("Error logging activity:", err);
	}
  };

  return (
	<>
	  <StickyProgressHeader />
	  <div className="p-4 max-w-4xl mx-auto">
		{/* Display the pack cover image at the top in a square container */}
		{coverImageUrl && (
		  <div className="mb-4 w-48 h-48 mx-auto overflow-hidden rounded-lg shadow-md">
			<img
			  src={coverImageUrl}
			  alt={packTitle}
			  className="w-full h-full object-cover"
			/>
		  </div>
		)}
		<h1 className="text-2xl font-bold mb-2">{packTitle}</h1>

		{/* Prize Section */}
		<div className="flex items-center space-x-4 mb-4">
		  {packPrizeImage && packPrizeImage.length > 0 && (
			<img
			  src={packPrizeImage[0].url}
			  alt={packTitle}
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
 * Standard SSR to fetch pack data + leaderboard.
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
