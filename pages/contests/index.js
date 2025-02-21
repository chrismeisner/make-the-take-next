// File: /pages/contests/index.js

import { useEffect, useState } from "react";
import Link from "next/link";

export default function ContestsIndexPage({ contests }) {
  const [timeLefts, setTimeLefts] = useState(() => contests.map(() => ""));

  // Helper to compute "time left" or "Ended!"
  function computeTimeLeft(endTime) {
	if (!endTime) return "";
	const now = Date.now();
	const end = new Date(endTime).getTime();
	const diff = end - now;
	if (diff <= 0) {
	  return "Ended!";
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
	return result.trim();
  }

  // Update the countdowns each second
  useEffect(() => {
	function updateCountdowns() {
	  const newTimeLefts = contests.map((c) =>
		c.contestEndTime ? computeTimeLeft(c.contestEndTime) : ""
	  );
	  setTimeLefts(newTimeLefts);
	}
	updateCountdowns();
	const intervalId = setInterval(updateCountdowns, 1000);
	return () => clearInterval(intervalId);
  }, [contests]);

  // Determine color-coded class based on the final status
  function getStatusClasses(status) {
	switch (status.toLowerCase()) {
	  case "ended":
		return "bg-gray-200 text-gray-800";
	  case "open":
		return "bg-green-200 text-green-800";
	  case "closed":
		return "bg-red-200 text-red-800";
	  // Add more statuses if needed
	  default:
		return "bg-gray-100 text-gray-600";
	}
  }

  // For each contest, if timeLeft === "Ended!" => override status => "Ended"
  function deriveStatus(contest, timeLeft) {
	if (timeLeft === "Ended!") {
	  return "Ended";
	}
	return contest.contestStatus || "";
  }

  return (
	<div className="max-w-4xl mx-auto p-4">
	  <h1 className="text-2xl font-bold mb-4">All Contests</h1>

	  {contests.length === 0 ? (
		<p>No contests available.</p>
	  ) : (
		<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
		  {contests.map((contest, index) => {
			const {
			  contestID,
			  contestTitle,
			  contestSummary,
			  contestPrize,
			  contestEndTime,
			} = contest;

			// Each contest's timeLeft
			const timeLeft = timeLefts[index];

			// Derive final status
			const finalStatus = deriveStatus(contest, timeLeft);
			// Color-coded classes
			const statusClasses = getStatusClasses(finalStatus);

			// "closed" or "Ended" => not clickable
			const isClickable =
			  finalStatus.toLowerCase() !== "closed" &&
			  finalStatus.toLowerCase() !== "ended";

			// Build the card content
			const cardContent = (
			  <div className="p-4 h-full flex flex-col">
				<h2 className="text-lg font-semibold mb-1">
				  {contestTitle || "Untitled Contest"}
				</h2>

				{finalStatus && (
				  <span
					className={`inline-block px-2 py-1 rounded text-xs font-semibold mb-2 ${statusClasses}`}
				  >
					{finalStatus}
				  </span>
				)}

				{contestSummary && (
				  <p className="text-sm text-gray-700 mb-2">{contestSummary}</p>
				)}

				{contestPrize && (
				  <p className="text-sm text-green-700 font-medium mb-2">
					Prize: {contestPrize}
				  </p>
				)}

				{contestEndTime && (
				  <p className="text-sm text-red-600 font-bold mb-2">
					{timeLeft}
				  </p>
				)}

				{/* "View Contest" or "No longer available" based on clickable */}
				<p className="mt-auto text-sm text-blue-600 underline">
				  {isClickable ? "View Contest" : "Not Available"}
				</p>
			  </div>
			);

			// If clickable => wrap in a Link
			// If not => show a static <div> with a more "muted" style
			if (isClickable) {
			  return (
				<Link
				  key={contestID}
				  href={`/contests/${contestID}`}
				  className="block border border-gray-200 rounded-md shadow-sm hover:shadow-lg transition-shadow bg-white"
				>
				  {cardContent}
				</Link>
			  );
			} else {
			  return (
				<div
				  key={contestID}
				  className="block border border-gray-200 rounded-md bg-gray-100 opacity-60"
				  title="This contest is no longer available"
				>
				  {cardContent}
				</div>
			  );
			}
		  })}
		</div>
	  )}
	</div>
  );
}

/**
 * SSR: fetch from /api/contests
 */
export async function getServerSideProps(context) {
  const proto = context.req.headers["x-forwarded-proto"] || "http";
  const host =
	context.req.headers["x-forwarded-host"] || context.req.headers.host;
  const origin = process.env.SITE_URL || `${proto}://${host}`;

  try {
	const resp = await fetch(`${origin}/api/contests`);
	const data = await resp.json();

	if (!resp.ok || !data.success) {
	  throw new Error(data.error || "Failed to load contests");
	}

	return {
	  props: {
		contests: data.contests || [],
	  },
	};
  } catch (err) {
	console.error("[ContestsIndexPage] Error =>", err);
	return {
	  props: {
		contests: [],
	  },
	};
  }
}
