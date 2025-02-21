// File: /pages/contests/index.js

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

export default function ContestsIndexPage({ contests }) {
  // 1) Memoize filtered "visibleContests" so it won't cause a new array every render:
  const visibleContests = useMemo(
	() => contests.filter((c) => c.contestStatus?.toLowerCase() !== "draft"),
	[contests]
  );

  // 2) We'll keep our local timeLeft state array for countdowns:
  //    Initialize size = visibleContests.length.
  const [timeLefts, setTimeLefts] = useState(() =>
	visibleContests.map(() => "")
  );

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

  // 3) Update the countdowns each second. We only re-run if visibleContests changes.
  useEffect(() => {
	function updateCountdowns() {
	  const newTimeLefts = visibleContests.map((c) =>
		c.contestEndTime ? computeTimeLeft(c.contestEndTime) : ""
	  );
	  setTimeLefts(newTimeLefts);
	}
	updateCountdowns();
	const intervalId = setInterval(updateCountdowns, 1000);
	return () => clearInterval(intervalId);
  }, [visibleContests]);

  // Convert Airtable status to a display label
  function getStatusLabel(status) {
	if (!status) return "";
	switch (status.toLowerCase()) {
	  case "coming up":
		return "Coming up";
	  case "open":
		return "Open";
	  case "closed":
		return "Closed";
	  default:
		return status;
	}
  }

  // Determine if a contest is clickable based on status
  function isContestClickable(status) {
	if (!status) return false;
	switch (status.toLowerCase()) {
	  case "coming up":
		return false;
	  case "open":
		return true;
	  case "closed":
		return true;
	  default:
		return false;
	}
  }

  // Pick color-coded classes for status (optional)
  function getStatusClasses(status) {
	if (!status) return "bg-gray-100 text-gray-600";
	switch (status.toLowerCase()) {
	  case "coming up":
		return "bg-yellow-200 text-yellow-800";
	  case "open":
		return "bg-green-200 text-green-800";
	  case "closed":
		return "bg-red-200 text-red-800";
	  default:
		return "bg-gray-100 text-gray-600";
	}
  }

  return (
	<div className="max-w-4xl mx-auto p-4">
	  <h1 className="text-2xl font-bold mb-4">All Contests</h1>

	  {visibleContests.length === 0 ? (
		<p>No contests available.</p>
	  ) : (
		<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
		  {visibleContests.map((contest, index) => {
			const {
			  contestID,
			  contestTitle,
			  contestSummary,
			  contestPrize,
			  contestEndTime,
			  contestStatus,
			} = contest;

			const timeLeft = timeLefts[index];
			const label = getStatusLabel(contestStatus);
			const statusClasses = getStatusClasses(contestStatus);
			const clickable = isContestClickable(contestStatus);

			const cardContent = (
			  <div className="p-4 h-full flex flex-col">
				<h2 className="text-lg font-semibold mb-1">
				  {contestTitle || "Untitled Contest"}
				</h2>
				{label && (
				  <span
					className={`inline-block px-2 py-1 rounded text-xs font-semibold mb-2 ${statusClasses}`}
				  >
					{label}
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
				<p className="mt-auto text-sm text-blue-600 underline">
				  {clickable ? "View Contest" : "Not Available"}
				</p>
			  </div>
			);

			if (clickable) {
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
				  className="border border-gray-200 rounded-md bg-gray-50 opacity-90"
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
