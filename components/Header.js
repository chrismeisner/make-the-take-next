import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { signOut, useSession } from "next-auth/react";
import { useWireframe } from "../contexts/WireframeContext";

// Minimal link style for header links (non-pill)
const linkBaseStyles = "text-sm text-gray-200 hover:text-gray-300 transition-colors";

// Pill style for profile (slightly subtle "tag" look)
const pillLinkStyles = `
  inline-flex items-center
  px-3 py-1
  rounded-full text-sm
  bg-gray-700 hover:bg-gray-600
  text-gray-200 transition-colors
`;

export default function Header() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { enabled: wireframeMode, setEnabled: setWireframeMode } = useWireframe();
  const [userPoints, setUserPoints] = useState(null);
  const [timezone, setTimezone] = useState("");

  useEffect(() => {
	console.log("[Header] Session status:", status);
	console.log("[Header] Session data:", session);

	async function fetchPoints() {
	  if (!session?.user?.phone) {
		setUserPoints(null);
		return;
	  }
	  try {
		const resp = await fetch("/api/userPoints");
		const data = await resp.json();
		if (data.success) {
		  const roundedPts = Math.round(data.totalPoints || 0);
		  setUserPoints(roundedPts);
		} else {
		  console.log("[Header] /api/userPoints error =>", data.error);
		  setUserPoints(null);
		}
	  } catch (err) {
		console.error("[Header] fetchPoints error =>", err);
		setUserPoints(null);
	  }
	}

	if (session?.user) {
	  fetchPoints();
	} else {
	  setUserPoints(null);
	}
  }, [session, status]);

  // Detect and store user's time zone on client
  useEffect(() => {
	if (typeof Intl !== "undefined" && Intl.DateTimeFormat) {
	  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
	  setTimezone(tz);
	}
  }, []);

  // Logged out => simple login button
  function LoginButton() {
	return (
	  <Link
		href={`/login?redirect=${encodeURIComponent(router.asPath)}`}
		className={linkBaseStyles}
	  >
		Log in
	  </Link>
	);
  }

  // If user is logged in => show profile link and sign out button
  function LoggedInLinks() {
	if (!session?.user?.profileID) return null;

	const profileID = session.user.profileID;

	return (
	  <div className="flex items-center space-x-3">
		{/* ProfileID => link to /profile/[profileID] */}
		<Link href={`/profile/${profileID}`} className={pillLinkStyles}>
		  💀 {profileID}
		</Link>
		<button onClick={() => signOut()} className={pillLinkStyles}>
		  Sign Out
		</button>
	  </div>
	);
  }

  return (
	<header className="fixed inset-x-0 top-0 z-50 bg-gray-800 text-white shadow-md border-b border-gray-700">
	  <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
		{/* Single row: brand on left, nav on right */}
		<div className="flex items-center justify-between h-12">
		  {/* Brand and timezone */}
		  <div className="flex items-center">
			<Link href="/" className={linkBaseStyles}>
			  🏴‍☠️ Make The Take
			</Link>
			{timezone && (
			  <span className="ml-4 text-xs text-gray-300">{timezone}</span>
			)}
		  </div>
		  <nav className="flex items-center space-x-4">
			<label className="flex items-center space-x-1">
			  <input
				type="checkbox"
				checked={wireframeMode}
				onChange={() => setWireframeMode(!wireframeMode)}
				className="form-checkbox h-4 w-4 text-red-500 bg-gray-800 border-gray-300 rounded"
			  />
			  <span className="text-sm text-gray-200">Wireframe</span>
			</label>
			{session?.user && session.user.profileID ? (
			  <LoggedInLinks />
			) : (
			  <LoginButton />
			)}
		  </nav>
		</div>
	  </div>
	</header>
  );
}
