// File: /pages/contests/index.js

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

/** Helper to format a date like "Monday, Feb 24" */
function formatDate(dStr) {
  if (!dStr) return "";
  const d = new Date(dStr);
  if (isNaN(d.getTime())) return ""; // invalid date check
  return d.toLocaleDateString("en-US", {
	weekday: "long",
	month: "short",
	day: "numeric",
  });
}

export default function ContestsIndexPage({ contests }) {
  /**************************************
   * 1) Checkboxes for filtering        *
   *    Now in order: Open, Coming Up, Closed
   **************************************/
  const [showStatuses, setShowStatuses] = useState({
	open: true,
	comingUp: true,
	closed: true, // includes "closed" + "graded"
  });

  function handleStatusChange(key) {
	setShowStatuses((prev) => ({
	  ...prev,
	  [key]: !prev[key],
	}));
  }

  /********************************************
   * 2) Filter out "draft", handle "graded"   *
   ********************************************/
  const filteredContests = useMemo(() => {
	return contests.filter((c) => {
	  const s = c.contestStatus?.toLowerCase() || "";
	  if (s === "draft") return false;

	  // open
	  if (s === "open" && !showStatuses.open) return false;

	  // coming up
	  if (s === "coming up" && !showStatuses.comingUp) return false;

	  // closed or graded => checkbox "closed"
	  if ((s === "closed" || s === "graded") && !showStatuses.closed) return false;

	  return true;
	});
  }, [contests, showStatuses]);

  /**************************************************************
   * 3) Sorting => Open (1), Coming Up (2), Closed (3), Graded (4)
   **************************************************************/
  function getStatusPriority(status) {
	const s = status?.toLowerCase();
	if (s === "open") return 1;
	if (s === "coming up") return 2;
	if (s === "closed") return 3;
	if (s === "graded") return 4;
	return 99; // fallback
  }

  const sortedContests = useMemo(() => {
	const copy = [...filteredContests];
	copy.sort((a, b) => {
	  const aP = getStatusPriority(a.contestStatus);
	  const bP = getStatusPriority(b.contestStatus);
	  return aP - bP;
	});
	return copy;
  }, [filteredContests]);

  /********************************************************
   * 4) Countdown => only "open" => timeLefts array       *
   ********************************************************/
  const [timeLefts, setTimeLefts] = useState(() =>
	sortedContests.map(() => "")
  );

  /** Compute "Xd Xh Xm Xs" or "Ended!" */
  function computeTimeLeft(endTime) {
	if (!endTime) return "";
	const now = Date.now();
	const end = new Date(endTime).getTime();
	const diff = end - now;
	if (diff <= 0) {
	  return "Ended!";
	}
	const secs = Math.floor(diff / 1000) % 60;
	const mins = Math.floor(diff / (1000 * 60)) % 60;
	const hrs = Math.floor(diff / (1000 * 60 * 60)) % 24;
	const days = Math.floor(diff / (1000 * 60 * 60 * 24));
	let result = "";
	if (days > 0) result += `${days}d `;
	if (hrs > 0 || days > 0) result += `${hrs}h `;
	if (mins > 0 || hrs > 0 || days > 0) result += `${mins}m `;
	result += `${secs}s`;
	return result.trim();
  }

  // If sortedContests changes, reset
  useEffect(() => {
	setTimeLefts(sortedContests.map(() => ""));
  }, [sortedContests]);

  // Update countdown every second if status === "open"
  useEffect(() => {
	function updateCountdowns() {
	  const newTimes = sortedContests.map((c) => {
		if (c.contestStatus?.toLowerCase() === "open" && c.contestEndTime) {
		  return computeTimeLeft(c.contestEndTime);
		}
		return "";
	  });
	  setTimeLefts(newTimes);
	}
	updateCountdowns();
	const timer = setInterval(updateCountdowns, 1000);
	return () => clearInterval(timer);
  }, [sortedContests]);

  /************************************************
   * 5) label, color classes, etc.                *
   ************************************************/
  function getStatusLabel(status) {
	const s = status?.toLowerCase();
	switch (s) {
	  case "open":
		return "Open";
	  case "closed":
		return "Closed";
	  case "graded":
		return "Graded";
	  case "coming up":
		return "Coming Up";
	  default:
		return s || "";
	}
  }

  // color-coded classes
  function getStatusClasses(status) {
	const s = status?.toLowerCase();
	switch (s) {
	  case "open":
		return "bg-green-200 text-green-800";
	  case "coming up":
		return "bg-yellow-200 text-yellow-800";
	  case "closed":
		return "bg-red-200 text-red-800";
	  case "graded":
		return "bg-purple-200 text-purple-800";
	  default:
		return "bg-gray-100 text-gray-600";
	}
  }

  // We'll show a link only if open/closed/graded
  function getButtonText(status) {
	const s = status?.toLowerCase();
	if (s === "open") return "Enter Contest";
	if (s === "closed" || s === "graded") return "Contest Result";
	// "coming up" => no link
	return null;
  }
  function isClickable(status) {
	const s = status?.toLowerCase();
	return s === "open" || s === "closed" || s === "graded";
  }

  // Helper to format "contestStartTime" => "Monday, Feb 24"
  function formatDate(dStr) {
	if (!dStr) return "";
	const d = new Date(dStr);
	if (isNaN(d.getTime())) return ""; // invalid date check
	return d.toLocaleDateString("en-US", {
	  weekday: "long",
	  month: "short",
	  day: "numeric",
	});
  }

  /*********************************************
   * 6) Render the page layout & the contest cards
   *********************************************/
  return (
	<div className="max-w-4xl mx-auto p-4">
	  <h1 className="text-2xl font-bold mb-4">All Contests</h1>

	  {/* Filter checkboxes => Open, Coming Up, Closed */}
	  <div className="flex flex-wrap gap-4 mb-6">
		<label className="inline-flex items-center space-x-1 text-sm">
		  <input
			type="checkbox"
			checked={showStatuses.open}
			onChange={() => handleStatusChange("open")}
		  />
		  <span>Open</span>
		</label>

		<label className="inline-flex items-center space-x-1 text-sm">
		  <input
			type="checkbox"
			checked={showStatuses.comingUp}
			onChange={() => handleStatusChange("comingUp")}
		  />
		  <span>Coming Up</span>
		</label>

		<label className="inline-flex items-center space-x-1 text-sm">
		  <input
			type="checkbox"
			checked={showStatuses.closed}
			onChange={() => handleStatusChange("closed")}
		  />
		  <span>Closed</span>
		</label>
	  </div>

	  {sortedContests.length === 0 ? (
		<p>No contests available.</p>
	  ) : (
		<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
		  {sortedContests.map((contest, idx) => {
			const {
			  contestID,
			  contestTitle,
			  contestSummary,
			  contestPrize,
			  contestEndTime,
			  contestStatus,
			  contestCover,
			  contestStartTime, // from the API
			  contestWinner,
			} = contest;

			// The first cover (if any)
			const coverUrl =
			  contestCover && contestCover.length > 0
				? contestCover[0].url
				: null;

			// label & style
			const label = getStatusLabel(contestStatus);
			const statusClasses = getStatusClasses(contestStatus);

			// If open => countdown
			const timeLeft = timeLefts[idx];

			// If comingUp => show release date
			const releaseDate = formatDate(contestStartTime);

			// final button => "Enter Contest" or "Contest Result" or null
			const btnText = getButtonText(contestStatus);
			const clickable = isClickable(contestStatus);

			return (
			  <div
				key={contestID}
				className="h-full flex flex-col border border-gray-200 rounded-md bg-white shadow-sm hover:shadow-md transition-shadow"
			  >
				{/* Cover */}
				<div className="w-full h-40 overflow-visible">
				  {coverUrl ? (
					<img
					  src={coverUrl}
					  alt={contestTitle}
					  className="w-full h-full object-cover"
					/>
				  ) : (
					<div className="w-full h-full bg-gray-800" />
				  )}
				</div>

				{/* Text content */}
				<div className="p-4 flex flex-col flex-1">
				  <h2 className="text-lg font-semibold mb-1">
					{contestTitle || "Untitled Contest"}
				  </h2>

				  {/* status label */}
				  {label && (
					<span
					  className={`inline-block px-2 py-1 rounded text-xs font-semibold mb-2 ${statusClasses}`}
					>
					  {label}
					</span>
				  )}

				  {/* summary */}
				  {contestSummary && (
					<p className="text-sm text-gray-700 mb-2">
					  {contestSummary}
					</p>
				  )}

				  {/* prize */}
				  {contestPrize && (
					<p className="text-sm text-green-700 font-medium mb-2">
					  Prize: {contestPrize}
					</p>
				  )}

				  {/* open => countdown + "Time left to enter" */}
				  {contestStatus?.toLowerCase() === "open" && contestEndTime && (
					<div className="mb-2">
					  <p className="text-sm text-red-600 font-bold">
						{timeLeft}
					  </p>
					  <p className="text-xs text-gray-600 italic">
						Time left to enter
					  </p>
					</div>
				  )}

				  {/* graded => show winner */}
				  {contestStatus?.toLowerCase() === "graded" &&
					contestWinner?.profileUsername && (
					  <p className="text-sm text-gray-900 mb-2">
						Winner:{" "}
						<Link
						  href={`/profile/${contestWinner.profileID}`}
						  className="text-blue-600 underline"
						>
						  {contestWinner.profileUsername}
						</Link>
					  </p>
					)}

				  {/* coming up => show release date if available */}
				  {contestStatus?.toLowerCase() === "coming up" && releaseDate && (
					<p className="text-xs text-gray-600 italic mb-2">
					  Release date: {releaseDate}
					</p>
				  )}

				  {/* The final button => open/closed => link, else no button */}
				  <div className="mt-auto">
					{btnText ? (
					  clickable ? (
						<Link
						  href={`/contests/${contestID}`}
						  className="text-sm text-blue-600 underline"
						>
						  {btnText}
						</Link>
					  ) : (
						<span className="text-sm text-gray-600">
						  {btnText}
						</span>
					  )
					) : (
					  // "coming up" => no button
					  null
					)}
				  </div>
				</div>
			  </div>
			);
		  })}
		</div>
	  )}
	</div>
  );
}

// SSR: fetch from /api/contests
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
	return { props: { contests: [] } };
  }
}
