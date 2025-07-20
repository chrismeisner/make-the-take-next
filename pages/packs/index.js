// File: /pages/packs/index.js
 
import { useState } from "react";
import Link from "next/link";

export default function PacksIndexPage({ packsData }) {
  // Client state for sorting and filtering
  const [sortType, setSortType] = useState("newest");
  const [showEvent, setShowEvent] = useState(true);
  const [showContent, setShowContent] = useState(true);

  // Sorting function: sorts by newest, oldest, or soonest event
  function sortPacks(list, type) {
	const sorted = [...list];
	if (type === "oldest") {
	  sorted.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
	} else if (type === "newest") {
	  sorted.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
	} else if (type === "soonest") {
	  // For events: earliest eventTime first
	  sorted.sort((a, b) => {
		const aIsEvent = a.packType === "event" && a.eventTime;
		const bIsEvent = b.packType === "event" && b.eventTime;
		if (!aIsEvent && !bIsEvent) return 0;
		if (!aIsEvent) return 1;
		if (!bIsEvent) return -1;
		return new Date(a.eventTime) - new Date(b.eventTime);
	  });
	}
	return sorted;
  }

  // Filtering function: only show packs of a certain type if checkbox is checked
  function filterPacks(list) {
	return list.filter((pack) => {
	  if (pack.packType === "event" && showEvent) return true;
	  if (pack.packType === "content" && showContent) return true;
	  return false;
	});
  }

  // Color-code the status badge
  function getStatusClasses(status) {
	switch (status) {
	  case "Coming Up":
		return "bg-yellow-200 text-yellow-800";
	  case "Active":
		return "bg-green-200 text-green-800";
	  case "Completed":
		return "bg-blue-200 text-blue-800";
	  default:
		return "bg-gray-200 text-gray-800";
	}
  }

  // Apply sorting and filtering on the packsData from server-side
  const sortedPacks = sortPacks(packsData, sortType);
  const visiblePacks = filterPacks(sortedPacks);

  return (
	<div style={{ padding: "1rem" }}>
	  <h1>All Packs</h1>

	  {/* Sort Dropdown */}
	  <div style={{ marginBottom: "1rem" }}>
		<label style={{ marginRight: "0.5rem" }}>Sort by:</label>
		<select
		  value={sortType}
		  onChange={(e) => setSortType(e.target.value)}
		>
		  <option value="newest">Newest</option>
		  <option value="oldest">Oldest</option>
		  <option value="soonest">Soonest Events</option>
		</select>
	  </div>

	  {/* Filter Checkboxes */}
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
		<p>No packs available.</p>
	  ) : (
		<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
		  {visiblePacks.map((pack) => {
			const statusClasses = getStatusClasses(pack.packStatus);
			const combinedLine =
			  typeof pack.userTakeCount === "number" &&
			  typeof pack.propsCount === "number"
				? `You have ${pack.userTakeCount} of ${pack.propsCount} takes in this pack`
				: null;

			return (
			  <div
				key={pack.packID}
				className="border rounded shadow-md bg-white overflow-visible p-2"
			  >
				<div
				  className={`aspect-square relative bg-blue-600 bg-cover bg-center ${
					pack.packStatus === "Coming Up" ? "opacity-50" : ""
				  } ${!pack.packCover ? "flex justify-center items-center" : ""}`}
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
				  {pack.eventTime && (
					<div className="absolute bottom-0 left-0 bg-black bg-opacity-50 text-white text-xs p-1">
					  {pack.eventTime}
					</div>
				  )}
				</div>

				<div className="p-4">
				  <h2 className="text-lg font-semibold">
					{pack.packTitle}
				  </h2>
				  <p className="text-xs text-gray-500">
					{pack.propsCount} propositions
				  </p>
				  <span
					className={`inline-block px-2 py-1 rounded text-xs font-semibold mt-1 ${statusClasses}`}
				  >
					{pack.packStatus}
				  </span>

				  {combinedLine && (
					<p className="text-sm text-gray-700 mt-2">
					  {combinedLine}
					</p>
				  )}

				  {pack.packPrize && (
					<p className="text-sm text-green-600 mt-1">
					  🎖️ 1st Place: {pack.packPrize}
					</p>
				  )}
				  {pack.prizeSummary && (
					<p className="text-sm text-gray-600">
					  {pack.prizeSummary}
					</p>
				  )}
				  {pack.packSummary && (
					<p className="text-sm text-gray-700 mt-2">
					  {pack.packSummary}
					</p>
				  )}

				  {/* Action Buttons Based on Pack Status */}
				  {pack.packStatus === "Active" && (
					<Link href={`/packs/${pack.packURL}`}>
					  <button className="mt-4 w-full py-2 px-4 bg-blue-600 text-white rounded hover:bg-blue-700">
						Play This Pack
					  </button>
					</Link>
				  )}
				  {pack.packStatus === "Completed" && (
					<Link href={`/packs/${pack.packURL}`}>
					  <button className="mt-4 w-full py-2 px-4 bg-green-600 text-white rounded hover:bg-green-700">
						See Results
					  </button>
					</Link>
				  )}
				  {pack.packStatus === "Coming Up" && (
					<a
					  href="#"
					  onClick={(e) => e.preventDefault()}
					  className="mt-4 block"
					>
					  <button className="w-full py-2 px-4 bg-gray-600 text-white rounded hover:bg-gray-700">
						Notify Me
					  </button>
					</a>
				  )}
				</div>
			  </div>
			);
		  })}
		</div>
	  )}
	</div>
  );
}

// getServerSideProps: fetch packs from the consolidated API endpoint
export async function getServerSideProps(context) {
  const proto = context.req.headers["x-forwarded-proto"] || "http";
  const host =
	context.req.headers["x-forwarded-host"] || context.req.headers.host;
  const origin = process.env.SITE_URL || `${proto}://${host}`;

  try {
	const res = await fetch(`${origin}/api/packs`);
	const data = await res.json();
	if (!res.ok || !data.success) {
	  throw new Error(data.error || "Failed to load packs");
	}
	return { props: { packsData: data.packs || [] } };
  } catch (error) {
	console.error("[PacksIndexPage] Error fetching packs:", error);
	return { props: { packsData: [] } };
  }
}
