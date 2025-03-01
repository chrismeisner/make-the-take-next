import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { signOut, useSession } from "next-auth/react";

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

  const [userPoints, setUserPoints] = useState(null);

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
	<header className="sticky top-0 z-50 bg-gray-800 text-white shadow-md border-b border-gray-700">
	  <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
		{/* Single row: brand on left, nav on right */}
		<div className="flex items-center justify-between h-12">
		  {/* Brand now links to index page */}
		  <Link href="/" className={linkBaseStyles}>
			🏴‍☠️ Make The Take
		  </Link>
		  <nav className="flex items-center space-x-4">
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
