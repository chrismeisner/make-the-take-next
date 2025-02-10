// pages/index.js
import { useState, useEffect } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";

export default function HomePage() {
  const { data: session } = useSession();
  const [propsList, setPropsList] = useState([]);
  const [loadingProps, setLoadingProps] = useState(true);
  const [propsError, setPropsError] = useState("");
  const [userTakesMap, setUserTakesMap] = useState({});
  const [loadingTakes, setLoadingTakes] = useState(false);

  // 1) Fetch props
  useEffect(() => {
	async function loadProps() {
	  try {
		const res = await fetch("/api/props");
		const data = await res.json();
		if (!data.success) {
		  setPropsError(data.error || "Unknown error fetching props");
		  setLoadingProps(false);
		  return;
		}
		const filteredProps = (data.props || []).filter(
		  (prop) => prop.propStatus !== "archived"
		);
		setPropsList(filteredProps);
	  } catch (err) {
		console.error("[HomePage] error:", err);
		setPropsError("Could not fetch props");
	  } finally {
		setLoadingProps(false);
	  }
	}
	loadProps();
  }, []);

  // 2) If logged in => load userTakesAll
  useEffect(() => {
	if (!session?.user) return;

	setLoadingTakes(true);
	async function loadUserTakes() {
	  try {
		const res = await fetch("/api/userTakesAll");
		const data = await res.json();
		if (!data.success) {
		  console.error("[HomePage] userTakesAll error:", data.error);
		  setLoadingTakes(false);
		  return;
		}
		// Build a map => { propID: { side: "A"/"B", takeID: ..., ... } }
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
  }, [session]);

  if (loadingProps) return <div className="p-4">Loading props...</div>;
  if (propsError) {
	return <div className="p-4 text-red-600">Error: {propsError}</div>;
  }
  if (propsList.length === 0) {
	return <div className="p-4">No props found.</div>;
  }

  return (
	<div className="p-4">
	  <h2 className="text-2xl font-bold mb-4">All Propositions</h2>
	  <div className="space-y-6">
		{propsList.map((prop) => {
		  const userTake = userTakesMap[prop.propID];
		  // If userTake => userTake.side is "A" or "B"
		  // sideLabel is for display
		  let sideLabel = "";
		  if (userTake) {
			sideLabel =
			  userTake.side === "A"
				? prop.PropSideAShort || "Side A"
				: prop.PropSideBShort || "Side B";
		  }

		  return (
			<div key={prop.propID} className="border p-4 rounded">
			  <div className="flex items-center">
				{prop.subjectLogoUrls && prop.subjectLogoUrls.length > 0 && (
				  <div className="w-10 aspect-square overflow-hidden rounded mr-2">
					<img
					  src={prop.subjectLogoUrls[0]}
					  alt={prop.subjectTitle || "Subject Logo"}
					  className="w-full h-full object-cover"
					/>
				  </div>
				)}
				<h3 className="text-xl font-semibold">
				  <Link
					href={`/props/${prop.propID}`}
					className="text-blue-600 hover:underline"
				  >
					{prop.propTitle}
				  </Link>
				</h3>
			  </div>
			  {(prop.subjectTitle || prop.propStatus) && (
				<p className="mt-1 text-sm text-gray-600">
				  {prop.subjectTitle && <>Subject: {prop.subjectTitle}</>}
				  {prop.subjectTitle && prop.propStatus && (
					<span className="ml-4">Status: {prop.propStatus}</span>
				  )}
				  {!prop.subjectTitle && prop.propStatus && (
					<>Status: {prop.propStatus}</>
				  )}
				</p>
			  )}
			  <p className="mt-1 text-gray-500">Created: {prop.createdAt}</p>

			  {/* Content image or placeholder */}
			  <div className="mt-4">
				{prop.contentImageUrls && prop.contentImageUrls.length > 0 ? (
				  <Link href={`/props/${prop.propID}`}>
					<div className="w-full max-w-sm aspect-video overflow-hidden bg-gray-300">
					  <img
						src={prop.contentImageUrls[0]}
						alt="Prop content"
						className="w-full h-full object-cover"
					  />
					</div>
				  </Link>
				) : (
				  <Link href={`/props/${prop.propID}`}>
					<div className="w-full max-w-sm aspect-video overflow-hidden bg-blue-500 text-white flex items-center justify-center font-bold">
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

			  {/* "Your Take" section */}
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
				  <UserTakeLine
					prop={prop}
					userTake={userTake}
					sideLabel={sideLabel}
				  />
				) : (
				  <p className="text-gray-600">No take on this prop yet.</p>
				)}
			  </div>
			</div>
		  );
		})}
	  </div>
	</div>
  );
}

/**
 * Renders a single line: 🏴‍☠️ + (✅ or ❌) + link to the user's take
 */
function UserTakeLine({ prop, userTake, sideLabel }) {
  // 1) Decide if there's a "graded" status
  //    e.g. "gradedA" => side A is the winner
  //         "gradedB" => side B is the winner
  //    If the userTake.side matches the winner => ✅, otherwise ❌
  let gradeEmoji = "";
  if (prop.propStatus === "gradedA") {
	gradeEmoji = userTake.side === "A" ? "✅" : "❌";
  } else if (prop.propStatus === "gradedB") {
	gradeEmoji = userTake.side === "B" ? "✅" : "❌";
  }

  // 2) We always show the pirate flag
  const pirateEmoji = "🏴‍☠️";

  // 3) The link to the user’s take
  const takeUrl = `/takes/${userTake.takeID}`;

  // 4) Combine them in a single line
  return (
	<p className="text-gray-600">
	  {pirateEmoji} {gradeEmoji}{" "}
	  <Link href={takeUrl} className="text-blue-600 hover:underline">
		<strong>{sideLabel}</strong>
	  </Link>
	</p>
  );
}
