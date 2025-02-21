// File: /components/Header.js

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

  // Link to /contests => 🎉 on mobile, "Contests" on sm+.
  function ContestsLink() {
	return (
	  <Link href="/contests" className="hover:text-gray-300 transition-colors">
		<span className="inline-block sm:hidden" aria-label="Contests">
		  🎉
		</span>
		<span className="hidden sm:inline">Contests</span>
	  </Link>
	);
  }

  // Link to /prizes => 🎁 on mobile, "Prizes" on sm+.
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

  // Login link => route to /login with redirect
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

  // Profile link => “skull” icon linking to /profile/[profileID]
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
		  {/* Brand name */}
		  <Link
			href="/"
			className="font-bold hover:text-gray-200 text-base sm:text-2xl"
		  >
			Make The Take
		  </Link>

		  {/* Navigation */}
		  <nav className="flex items-center space-x-4 text-sm">
			{/* 1. Contests link (then prizes) */}
			<ContestsLink />
			<PrizesLink />

			{/* If user is logged in => show bones + profile link */}
			{session?.user && session.user.profileID ? (
			  <div className="flex items-center space-x-3">
				{/* “Bones” = userPoints */}
				<span className="text-xs sm:text-sm">
				  🦴 {userPoints ?? "..."}
				</span>

				{/* Profile link (skull) */}
				<ProfileSkull profileID={session.user.profileID} />
			  </div>
			) : (
			  <LoginButton />
			)}
		  </nav>
		</div>
	  </div>
	</header>
  );
}
