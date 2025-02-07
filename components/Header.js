import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { signOut, useSession } from "next-auth/react";

export default function Header() {
  const { data: session, status } = useSession() || {}; // Ensure session does not break rendering
  const router = useRouter();

  useEffect(() => {
	console.log("[Header] Rendering...");
	console.log("[Header] Session status:", status);
	console.log("[Header] Session data:", session);
  }, [session, status]);

  async function handleLogout() {
	console.log("[Header] Logging out user");
	await signOut({ redirect: false });
	router.push("/");
  }

  return (
	<header className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md border-b border-gray-300">
	  <div className="container mx-auto flex items-center justify-between py-4 px-6 min-h-[50px]">
		<Link href="/" className="text-2xl font-bold hover:text-gray-200">
		  Make The Take
		</Link>

		<nav className="flex items-center space-x-6">
		  <span className="text-sm">
			Status:
			<strong className="ml-1">
			  {status === "loading"
				? "Checking..."
				: session?.user
				? "Authenticated"
				: "Not Authenticated"}
			</strong>
		  </span>

		  <Link href="/leaderboard" className="hover:text-gray-300">
			Leaderboard
		  </Link>

		  {session?.user ? (
			<>
			  <Link href={`/profile/${session.user.profileID}`} className="hover:text-gray-300">
				Profile
			  </Link>
			  <button onClick={handleLogout} className="hover:text-gray-300 focus:outline-none">
				Logout
			  </button>
			</>
		  ) : (
			<Link href={`/login?redirect=${encodeURIComponent(router.asPath)}`} className="hover:text-gray-300">
			  Log in
			</Link>
		  )}
		</nav>
	  </div>
	</header>
  );
}
