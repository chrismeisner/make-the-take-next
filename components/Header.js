// File: /components/Header.js
import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { signOut, useSession } from "next-auth/react";

export default function Header() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
	console.log("[Header] Session status:", status);
	console.log("[Header] Session data:", session);
  }, [session, status]);

  // No logout here; you said you'd put it on the profile page.

  // For “Leaderboard,” show trophy on mobile, text on sm+.
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

  // The login link is styled like a small button
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
	// Sticky header, single row, top-0
	<header className="sticky top-0 z-50 bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md border-b border-gray-300">
	  <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
		{/* A single row => height is stable, so it never changes on mobile */}
		<div className="flex items-center justify-between h-12">
		  {/* Left side: brand link => smaller text on mobile, bigger on sm+ */}
		  <Link href="/" className="font-bold hover:text-gray-200 text-base sm:text-2xl">
			Make The Take
		  </Link>

		  {/* Right side: nav items in a row */}
		  <nav className="flex items-center space-x-4 text-sm">
			{/* Status line => hidden on mobile, shown on sm+ */}
			<span className="hidden sm:inline text-xs opacity-90">
			  Status:{" "}
			  <strong>
				{status === "loading"
				  ? "Checking..."
				  : session?.user
				  ? "Authenticated"
				  : "Not Authenticated"}
			  </strong>
			</span>

			{/* The “Leaderboard” => trophy on mobile, text on bigger screens */}
			<LeaderboardLink />

			{/* If user is logged in => skull, else => login button */}
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
