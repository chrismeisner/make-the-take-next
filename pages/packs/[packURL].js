// File: /pages/packs/[packURL].js

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import StickyProgressHeader from "../../components/StickyProgressHeader";
import PropCard from "../../components/PropCard";
import { PackContextProvider, usePackContext } from "../../contexts/PackContext";
import { useModal } from "../../contexts/ModalContext";

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
 * It displays the packCover (if available) at the top,
 * followed by the pack title, prize info, props list, and leaderboard.
 */
function PackInner({ packData, leaderboard, debugLogs }) {
  const { data: session } = useSession();
  const { verifiedProps } = usePackContext();
  const { openModal } = useModal();
  const [activityLogged, setActivityLogged] = useState(false);

  if (!packData) {
	return <div className="text-red-600 p-4">No pack data found (404).</div>;
  }

  // Debug logs (optional)
  if (debugLogs && typeof window !== "undefined") {
	console.log("[PackInner] debugLogs =>", debugLogs);
  }

  const {
	packTitle,
	packCover, // Array of cover images
	packPrize,
	packPrizeImage,
	prizeSummary,
	packPrizeURL,
	props,
  } = packData;

  // Determine the cover image URL (first attachment from packCover)
  const coverImageUrl =
	packCover && packCover.length > 0 ? packCover[0].url : null;

  // Sort props by numeric field "propOrder"
  const sortedProps = [...(props || [])].sort(
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
		setActivityLogged(true);
		openModal("packCompleted", { packTitle });
		logActivity();
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
		  profileID: session.user.profileID,
		  packID: packData.packID,
		  airtableId: session.user.airtableId,
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
		<PackLeaderboard leaderboard={leaderboard} packData={packData} />
	  </div>

	  {/* Extra bottom padding to prevent the sticky bar from overlapping the leaderboard */}
	  <div className="pb-32" />
	</>
  );
}

/**
 * Subcomponent to display the pack leaderboard at the bottom.
 */
function PackLeaderboard({ leaderboard, packData }) {
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
					<Link href={`/profile/${item.profileID}`}>
					  <span className="text-blue-600 underline">
						{obscurePhone(item.phone)}
					  </span>
					</Link>
				  ) : (
					obscurePhone(item.phone)
				  )}
				</td>
				<td className="py-2 px-3">{item.takes}</td>
				<td className="py-2 px-3">{Math.round(item.points)}</td>
				<td className="py-2 px-3">
				  {item.won}-{item.lost}
				  {item.pending ? ` (Pending: ${item.pending})` : ""}
				</td>
			  </tr>
			))}
		  </tbody>
		</table>
	  )}
	  <p className="mt-4">
		<Link
		  href={`/packs/${packData ? packData.packURL : "#"}`}
		  className="text-blue-600 underline"
		>
		  Back to Pack
		</Link>
	  </p>
	</div>
  );
}

/**
 * getServerSideProps: Fetch consolidated pack data and leaderboard.
 */
export async function getServerSideProps(context) {
  const { packURL } = context.params;
  if (!packURL) {
	console.log("[PackPage] No packURL provided in params => 404");
	return { notFound: true };
  }

  const proto = context.req.headers["x-forwarded-proto"] || "http";
  const host =
	context.req.headers["x-forwarded-host"] || context.req.headers.host;
  const fallbackOrigin = `${proto}://${host}`;
  const origin = process.env.SITE_URL || fallbackOrigin;

  console.log("[PackPage] getServerSideProps => packURL:", packURL);
  console.log("[PackPage] getServerSideProps => final origin:", origin);

  try {
	const res = await fetch(`${origin}/api/packs/${encodeURIComponent(packURL)}`);
	const data = await res.json();
	if (!res.ok || !data.success) {
	  throw new Error(data.error || "Failed to load pack");
	}
	const debugLogs = {
	  packURL,
	  origin,
	  packDataReceived: !!data.pack,
	  leaderboardCount: data.leaderboard ? data.leaderboard.length : 0,
	};
	return {
	  props: {
		packData: data.pack,
		leaderboard: data.leaderboard || [],
		debugLogs,
	  },
	};
  } catch (error) {
	console.error("[PackPage] Error:", error);
	return { notFound: true };
  }
}
