// File: /pages/packs/index.js

import { useState, useEffect } from "react";
import Link from "next/link";

export default function PacksIndexPage() {
  const [packs, setPacks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Sort defaults to "newest"
  const [sortType, setSortType] = useState("newest");

  // Two checkboxes for filtering: "event" and "content"
  const [showEvent, setShowEvent] = useState(true);
  const [showContent, setShowContent] = useState(true);

  useEffect(() => {
	async function fetchPacks() {
	  try {
		const res = await fetch("/api/packs");
		const data = await res.json();
		if (!res.ok || !data.success) {
		  throw new Error(data.error || "Failed to load packs");
		}
		setPacks(data.packs || []);
	  } catch (err) {
		setError(err.message || "Error fetching packs");
	  } finally {
		setLoading(false);
	  }
	}

	fetchPacks();
  }, []);

  // Sorting function
  function sortPacks(list, type) {
	const sorted = [...list];

	if (type === "oldest") {
	  // Earliest -> Latest by created date
	  sorted.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
	} else if (type === "newest") {
	  // Latest -> Earliest by created date
	  sorted.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
	} else if (type === "soonest") {
	  // Sort so that valid eventTime (packType === "event") appears first,
	  // sorted ascending by eventTime. Non-event or no eventTime go to bottom.
	  sorted.sort((a, b) => {
		const aIsEvent = a.packType === "event" && a.eventTime;
		const bIsEvent = b.packType === "event" && b.eventTime;

		// If both are non-events or missing eventTime, keep them together
		if (!aIsEvent && !bIsEvent) return 0;
		// If a is not an event but b is, a goes below
		if (!aIsEvent) return 1;
		// If b is not an event but a is, b goes below
		if (!bIsEvent) return -1;

		// Both are events with times, compare ascending
		return new Date(a.eventTime) - new Date(b.eventTime);
	  });
	}

	return sorted;
  }

  // Filter function
  function filterPacks(list) {
	return list.filter((pack) => {
	  // If packType is "event" and showEvent is true => keep it
	  // If packType is "content" and showContent is true => keep it
	  // Otherwise, exclude it
	  if (pack.packType === "event" && showEvent) return true;
	  if (pack.packType === "content" && showContent) return true;
	  return false;
	});
  }

  if (loading) {
	return <div>Loading packs...</div>;
  }

  if (error) {
	return <div style={{ color: "red" }}>{error}</div>;
  }

  // 1) Sort the array
  const sortedPacks = sortPacks(packs, sortType);

  // 2) Filter based on the checkboxes
  const visiblePacks = filterPacks(sortedPacks);

  return (
	<div style={{ padding: "1rem" }}>
	  <h1>Active Packs</h1>

	  {/* Sort dropdown */}
	  <div style={{ marginBottom: "1rem" }}>
		<label style={{ marginRight: "0.5rem" }}>Sort by:</label>
		<select
		  value={sortType}
		  onChange={(e) => setSortType(e.target.value)}
		>
		  <option value="newest">Newest</option>
		  <option value="oldest">Oldest</option>
		  {/* Our new sort option for Soonest Events */}
		  <option value="soonest">Soonest Events</option>
		</select>
	  </div>

	  {/* Filter checkboxes */}
	  <div style={{ marginBottom: "1rem" }}>
		<label style={{ marginRight: "1rem" }}>
		  <input
			type="checkbox"
			checked={showEvent}
			onChange={(e) => setShowEvent(e.target.checked)}
		  />{" "}
		  Event
		</label>

		<label>
		  <input
			type="checkbox"
			checked={showContent}
			onChange={(e) => setShowContent(e.target.checked)}
		  />{" "}
		  Content
		</label>
	  </div>

	  {visiblePacks.length === 0 ? (
		<p>No active packs available.</p>
	  ) : (
		<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
		  {visiblePacks.map((pack) => (
			<Link key={pack.packID} href={`/packs/${pack.packURL}`}>
			  <div className="border rounded shadow-md bg-white overflow-hidden cursor-pointer">
				{/* Pack Cover */}
				<div
				  className={`aspect-square bg-blue-600 bg-cover bg-center ${
					!pack.packCover ? "flex justify-center items-center" : ""
				  }`}
				  style={{
					backgroundImage: pack.packCover
					  ? `url(${pack.packCover})`
					  : undefined,
				  }}
				>
				  {!pack.packCover && (
					<span className="text-white text-xl font-bold">
					  No Cover
					</span>
				  )}
				</div>

				{/* Pack Title */}
				<div className="p-4">
				  <h2 className="text-lg font-semibold">{pack.packTitle}</h2>

				  {/* Pack Prize */}
				  {pack.packPrize && (
					<p className="text-xl text-green-500 flex items-center">
					  <span className="mr-2">🎖️ 1st place prize:</span>
					  {pack.packPrize}
					</p>
				  )}

				  {/* Prize Summary */}
				  {pack.prizeSummary && (
					<p className="text-sm text-gray-600">
					  {pack.prizeSummary}
					</p>
				  )}

				  {/* Pack Summary */}
				  {pack.packSummary && (
					<p className="text-sm text-gray-700 mt-2">
					  {pack.packSummary}
					</p>
				  )}

				  {/* Show eventTime if packType=event */}
				  {pack.packType === "event" && pack.eventTime && (
					<p className="text-sm text-blue-600 mt-1">
					  Event Time:{" "}
					  {new Date(pack.eventTime).toLocaleString()}
					</p>
				  )}

				  {/* Show createdAt if available */}
				  {pack.createdAt && (
					<p className="text-xs text-gray-500 mt-1">
					  Created:{" "}
					  {new Date(pack.createdAt).toLocaleString()}
					</p>
				  )}
				</div>
			  </div>
			</Link>
		  ))}
		</div>
	  )}
	</div>
  );
}
