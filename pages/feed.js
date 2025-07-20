// File: /pages/index.js
import { useState, useEffect } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
// Import the modal hook from our global modal context
import { useModal } from "../contexts/ModalContext";

export default function HomePage() {
  const { data: session } = useSession();
  const { openModal } = useModal();

  // Store *all* props loaded so far
  const [propsList, setPropsList] = useState([]);
  // If there's an offset (from Airtable) for the next page
  const [nextOffset, setNextOffset] = useState(null);
  // Loading + error states
  const [loadingProps, setLoadingProps] = useState(true);
  const [propsError, setPropsError] = useState("");

  // For user takes
  const [userTakesMap, setUserTakesMap] = useState({});
  const [loadingTakes, setLoadingTakes] = useState(false);

  // 1) On mount, fetch first 10 props from /api/props?limit=10
  useEffect(() => {
	fetchPropsData(null); // pass null offset
  }, []);

  async function fetchPropsData(offsetValue) {
	setLoadingProps(true);
	setPropsError("");

	try {
	  let url = "/api/props?limit=10";
	  if (offsetValue) {
		url += `&offset=${offsetValue}`;
	  }

	  const res = await fetch(url);
	  const data = await res.json();
	  if (!data.success) {
		setPropsError(data.error || "Error fetching props");
		setLoadingProps(false);
		return;
	  }

	  // data => { success: true, props: [...], nextOffset: "xxx" | null }
	  const newProps = data.props || [];
	  const newOffset = data.nextOffset || null;

	  // Append to our existing list
	  setPropsList((prev) => [...prev, ...newProps]);
	  setNextOffset(newOffset);
	} catch (err) {
	  console.error("[HomePage] fetchPropsData error:", err);
	  setPropsError("Could not fetch props");
	} finally {
	  setLoadingProps(false);
	}
  }

  // 2) If user logged in => load their takes once
  const { user } = session || {};
  useEffect(() => {
	if (!user?.phone) return;

	setLoadingTakes(true);
	async function loadUserTakes() {
	  try {
		const res = await fetch("/api/userTakesAll");
		const data = await res.json();
		if (!data.success) {
		  console.error("[HomePage] userTakesAll error:", data.error);
		  return;
		}
		// Build map => { propID: { side: "A"/"B", takeID, ... } }
		const map = {};
		data.userTakes.forEach((take) => {
		  map[take.propID] = take;
		});
		setUserTakesMap(map);
	  } catch (err) {
		console.error("[HomePage] userTakesAll fetch error:", err);
	  } finally {
		setLoadingTakes(false);
	  }
	}
	loadUserTakes();
  }, [user]);

  // NEW: When user is logged in, trigger the "featuredPack" modal
  useEffect(() => {
	if (session?.user) {
	  // Open the modal. You can pass additional props if needed.
	  openModal("featuredPack", {
		// Example: you could pass a featuredPackId or other props here
		// For now, we'll leave it empty.
	  });
	}
  }, [session, openModal]);

  // Show errors or loading states
  if (propsError) {
	return <div className="p-4 text-red-600">Error: {propsError}</div>;
  }

  if (propsList.length === 0 && loadingProps) {
	return <div className="p-4">Loading props...</div>;
  }

  return (
	<div className="p-4">
	  <h2 className="text-2xl font-bold mb-4">All Propositions</h2>

	  {/* Render the props so far */}
	  <div className="space-y-6">
		{propsList.map((prop) => {
		  const userTake = userTakesMap[prop.propID];
		  const sideLabel = userTake
			? userTake.side === "A"
			  ? prop.PropSideAShort || "Side A"
			  : prop.PropSideBShort || "Side B"
			: "";

		  return (
			<div key={prop.propID} className="border p-4 rounded">
			  {/* Title / Subject */}
			  <div className="flex items-center">
				{/* subjectLogo(s), if any */}
				{prop.subjectLogoUrls && prop.subjectLogoUrls.length > 0 && (
				  <div className="flex items-center gap-2">
					{prop.subjectLogoUrls.map((logoUrl, index) => (
					  <div key={index} className="w-10 aspect-square overflow-visible rounded">
						<img
						  src={logoUrl}
						  alt={
							prop.subjectTitles &&
							prop.subjectTitles[index]
							  ? prop.subjectTitles[index]
							  : "Subject Logo"
						  }
						  className="w-full h-full object-cover"
						/>
					  </div>
					))}
				  </div>
				)}
				<h3 className="text-xl font-semibold ml-2">
				  <Link
					href={`/props/${prop.propID}`}
					className="text-blue-600 hover:underline"
				  >
					{prop.propTitle}
				  </Link>
				</h3>
			  </div>

			  {prop.propStatus && (
				<p className="mt-1 text-sm text-gray-600">
				  Status: {prop.propStatus}
				</p>
			  )}
			  <p className="mt-1 text-gray-500">Created: {prop.createdAt}</p>

			  {/* Possibly show content images */}
			  <div className="mt-4">
				{prop.contentImageUrls && prop.contentImageUrls.length > 0 ? (
				  <Link href={`/props/${prop.propID}`}>
					<div className="w-full max-w-sm aspect-video overflow-visible bg-gray-300">
					  <img
						src={prop.contentImageUrls[0]}
						alt="Prop content"
						className="w-full h-full object-cover"
					  />
					</div>
				  </Link>
				) : (
				  <Link href={`/props/${prop.propID}`}>
					<div className="w-full max-w-sm aspect-video overflow-visible bg-blue-500 text-white flex items-center justify-center font-bold">
					  NEW IMAGE
					</div>
				  </Link>
				)}
			  </div>

			  <p className="mt-2">{prop.propSummary}</p>
			  <p className="mt-2 text-sm font-semibold">Make The Take:</p>
			  <p>
				<Link
				  href={`/props/${prop.propID}`}
				  className="text-blue-600 hover:underline"
				>
				  {prop.propShort || "View Prop"}
				</Link>
			  </p>

			  {/* Example: Your Take section */}
			  <div className="mt-4">
				<p className="text-sm font-semibold">Your Take:</p>
				{!session?.user ? (
				  <p className="text-gray-600">
					<Link href="/login?redirect=/" className="text-blue-600 underline">
					  Log in
					</Link>{" "}
					to see your take.
				  </p>
				) : loadingTakes ? (
				  <p className="text-gray-600">Loading your takes...</p>
				) : userTake ? (
				  <UserTakeLine prop={prop} userTake={userTake} sideLabel={sideLabel} />
				) : (
				  <p className="text-gray-600">No take on this prop yet.</p>
				)}
			  </div>
			</div>
		  );
		})}
	  </div>

	  {/* If there's a nextOffset, show "Load More" button */}
	  {nextOffset && !loadingProps && (
		<div className="mt-6">
		  <button
			onClick={() => fetchPropsData(nextOffset)}
			className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
		  >
			Load More
		  </button>
		</div>
	  )}

	  {/* Optionally show a spinner if we’re in the middle of loading more */}
	  {loadingProps && propsList.length > 0 && (
		<div className="mt-2 text-gray-500">Loading more...</div>
	  )}
	</div>
  );
}

/**
 * Example subcomponent to show 🏴‍☠️ + (✅ or ❌) + side label
 */
function UserTakeLine({ prop, userTake, sideLabel }) {
  let gradeEmoji = "";
  if (prop.propStatus === "gradedA") {
	gradeEmoji = userTake.side === "A" ? "✅" : "❌";
  } else if (prop.propStatus === "gradedB") {
	gradeEmoji = userTake.side === "B" ? "✅" : "❌";
  }
  const pirateEmoji = "🏴‍☠️";
  const takeUrl = `/takes/${userTake.takeID}`;

  return (
	<p className="text-gray-600">
	  {pirateEmoji} {gradeEmoji}{" "}
	  <Link href={takeUrl} className="text-blue-600 hover:underline">
		<strong>{sideLabel}</strong>
	  </Link>
	</p>
  );
}