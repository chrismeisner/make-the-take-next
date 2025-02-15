import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { signOut, useSession } from "next-auth/react";

export default function Header() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [userPoints, setUserPoints] = useState(null);

  useEffect(() => {
	console.log("[Header] Session status:", status);
	console.log("[Header] Session data:", session);

	// If user is logged in => fetch total points
	async function fetchPoints() {
	  if (!session?.user?.phone) {
		setUserPoints(null);
		return;
	  }
	  try {
		const resp = await fetch("/api/userPoints");
		const data = await resp.json();
		if (data.success) {
		  // Round to 0 decimals
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

  // Link to leaderboard => trophy on mobile, text on sm+.
  function LeaderboardLink() {
	return (
	  <Link href="/leaderboard" className="hover:text-gray-300 transition-colors">
		<span className="inline-block sm:hidden" aria-label="Leaderboard">
		  🏆
		</span>
		<span className="hidden sm:inline">Leaderboard</span>
	  </Link>
	);
  }

  // Link to prizes => gift on mobile, text on sm+
  function PrizesLink() {
	return (
	  <Link href="/prizes" className="hover:text-gray-300 transition-colors">
		<span className="inline-block sm:hidden" aria-label="Prizes">
		  🎁
		</span>
		<span className="hidden sm:inline">Prizes</span>
	  </Link>
	);
  }

  // Link to packs => added for navigation
  function PacksLink() {
	return (
	  <Link href="/packs" className="hover:text-gray-300 transition-colors">
		<span className="inline-block sm:hidden" aria-label="Packs">
		  📦
		</span>
		<span className="hidden sm:inline">Packs</span>
	  </Link>
	);
  }

  // The login link
  function LoginButton() {
	return (
	  <Link
		href={`/login?redirect=${encodeURIComponent(router.asPath)}`}
		className="px-3 py-1 bg-white text-blue-600 rounded hover:bg-gray-200 transition-colors focus:outline-none text-sm font-semibold"
	  >
		Log in
	  </Link>
	);
  }

  // If user is logged in, show a skull (💀) linking to profile
  function ProfileSkull({ profileID }) {
	return (
	  <Link
		href={`/profile/${profileID}`}
		className="text-lg sm:text-xl hover:text-gray-300 transition-colors"
		title="Your Profile"
	  >
		💀
	  </Link>
	);
  }

  return (
	<header className="sticky top-0 z-50 bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md border-b border-gray-300">
	  <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
		{/* Single row => brand on left, nav on right */}
		<div className="flex items-center justify-between h-12">
		  <Link href="/" className="font-bold hover:text-gray-200 text-base sm:text-2xl">
			Make The Take
		  </Link>

		  <nav className="flex items-center space-x-4 text-sm">
			{/* Show user points if logged in */}
			{session?.user ? (
			  <div className="text-xs sm:text-sm">
				PTS: <span className="font-bold">{userPoints ?? "..."}</span>
			  </div>
			) : (
			  <div className="hidden sm:block text-xs opacity-90">Not logged in</div>
			)}

			<LeaderboardLink />
			<PrizesLink />
			<PacksLink /> {/* Added link to packs */}

			{session?.user && session.user.profileID ? (
			  <ProfileSkull profileID={session.user.profileID} />
			) : (
			  <LoginButton />
			)}
		  </nav>
		</div>
	  </div>
	</header>
  );
}
