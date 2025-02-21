// File: /pages/packs/[packURL].js

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import StickyProgressHeader from "../../components/StickyProgressHeader";
import PropCard from "../../components/PropCard";
import { PackContextProvider, usePackContext } from "../../contexts/PackContext";
import { useModal } from "../../contexts/ModalContext";

export default function PackPage({ packData, leaderboard, debugLogs }) {
  // Optionally keep these logs or remove them entirely:
  console.log("[PackPage] SSR => packData:", packData);
  console.log("[PackPage] SSR => leaderboard:", leaderboard);
  console.log("[PackPage] SSR => debugLogs:", debugLogs);

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
 * PackInner: Renders the pack detail, props, optional countdown, leaderboard.
 */
function PackInner({ packData, leaderboard, debugLogs }) {
  const { data: session } = useSession();
  const { verifiedProps } = usePackContext();
  const { openModal } = useModal();
  const [activityLogged, setActivityLogged] = useState(false);

  // For eventTime countdown
  const [timeLeft, setTimeLeft] = useState("");

  // 1) If no packData => 404 message
  if (!packData) {
	return <div className="text-red-600 p-4">No pack data found (404).</div>;
  }

  // 2) Destructure the main data
  const {
	packTitle,
	packCover,
	packPrize,
	packPrizeImage,
	prizeSummary,
	packPrizeURL,
	props,
	eventTime,    // from linked "Event" record
	contentData,  // from linked "Content" table
  } = packData;

  // 3) Dynamic countdown if eventTime is present
  useEffect(() => {
	if (!eventTime) return;

	const endTime = new Date(eventTime).getTime();

	function updateCountdown() {
	  const now = Date.now();
	  const diff = endTime - now;

	  if (diff <= 0) {
		setTimeLeft("Event Started or Ended!");
		return;
	  }

	  const seconds = Math.floor(diff / 1000) % 60;
	  const minutes = Math.floor(diff / (1000 * 60)) % 60;
	  const hours = Math.floor(diff / (1000 * 60 * 60)) % 24;
	  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

	  let result = "";
	  if (days > 0) result += `${days}d `;
	  if (hours > 0 || days > 0) result += `${hours}h `;
	  if (minutes > 0 || hours > 0 || days > 0) result += `${minutes}m `;
	  result += `${seconds}s`;

	  setTimeLeft(result.trim());
	}

	updateCountdown();
	const intervalId = setInterval(updateCountdown, 1000);
	return () => clearInterval(intervalId);
  }, [eventTime]);

  // 4) Possibly open "favoriteTeam" modal if user has none
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
				  if (!result.success) {
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

  // 5) Show "packCompleted" modal if all props verified
  useEffect(() => {
	if (packData && packData.props?.length > 0) {
	  if (verifiedProps.size === packData.props.length && !activityLogged) {
		setActivityLogged(true);
		openModal("packCompleted", { packTitle });
		logActivity();
	  }
	}
  }, [verifiedProps, packData, packTitle, openModal, activityLogged]);

  // 6) logActivity for analytics
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
	  if (!data.success) {
		console.error("Error logging activity:", data.error);
	  }
	} catch (err) {
	  console.error("Error logging activity:", err);
	}
  };

  // 7) Sort props
  const sortedProps = [...(props || [])].sort(
	(a, b) => (a.propOrder || 0) - (b.propOrder || 0)
  );

  // 8) If eventTime => show countdown at the top
  return (
	<>
	  <StickyProgressHeader />
	  <div className="p-4 max-w-4xl mx-auto">
		{/* EventTime Countdown (if any) */}
		{eventTime && (
		  <div className="text-center mb-4 p-2 bg-yellow-50 border border-yellow-200 rounded">
			<h2 className="text-lg font-semibold mb-1">Event Countdown</h2>
			{timeLeft ? (
			  <p className="text-xl font-bold text-red-600">{timeLeft}</p>
			) : (
			  <p className="text-sm text-gray-600">Loading countdown...</p>
			)}
			<p className="text-sm text-gray-600">
			  Event Time: {new Date(eventTime).toLocaleString()}
			</p>
		  </div>
		)}

		{/* If there's contentData, show it */}
		{packData.contentData && packData.contentData.length > 0 && (
		  <section className="mb-6">
			<h2 className="text-xl font-bold">Additional Content</h2>
			<div className="mt-2">
			  {packData.contentData.map((item) => (
				<div
				  key={item.airtableId}
				  className="mb-3 border p-2 rounded"
				>
				  <h3 className="text-lg font-semibold">
					<a
					  href={item.contentURL}
					  target="_blank"
					  rel="noopener noreferrer"
					  className="underline text-blue-600"
					>
					  {item.contentTitle}
					</a>
				  </h3>
				  {item.contentSource && (
					<p className="text-sm text-gray-600">
					  Source: {item.contentSource}
					</p>
				  )}
				  {item.contentImage && (
					<img
					  src={item.contentImage}
					  alt={item.contentSource || "No source"}
					  style={{ width: "80px", float: "left", marginRight: "1rem" }}
					/>
				  )}
				</div>
			  ))}
			</div>
		  </section>
		)}

		{/* Cover image */}
		{packCover && packCover.length > 0 && (
		  <div className="mb-4 w-48 h-48 mx-auto overflow-hidden rounded-lg shadow-md">
			<img
			  src={packCover[0].url}
			  alt={packTitle}
			  className="w-full h-full object-cover"
			/>
		  </div>
		)}

		<h1 className="text-2xl font-bold mb-2">{packTitle}</h1>

		{/* Prize section */}
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

		<PackLeaderboard leaderboard={leaderboard} packData={packData} />
	  </div>

	  {/* Extra bottom padding to prevent StickyProgressHeader overlap */}
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
 * getServerSideProps: fetch pack data from /api/packs/[packURL] and display it.
 */
export async function getServerSideProps(context) {
  const { packURL } = context.params;
  if (!packURL) {
	console.log("[PackPage] No packURL => 404");
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
	console.log("[PackPage] /api/packs response =>", data);

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
	console.error("[PackPage] Error =>", error);
	return { notFound: true };
  }
}
