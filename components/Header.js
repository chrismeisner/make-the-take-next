import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useSession } from "next-auth/react";

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

export default function Header({ collapsed, setCollapsed }) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [userPoints, setUserPoints] = useState(null);
  const [tokenBalance, setTokenBalance] = useState(null);
  // timezone detection removed; now only in admin page

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
  
  // Compute token balance based on points and exchanges
  useEffect(() => {
    if (userPoints == null || !session?.user?.profileID) {
      setTokenBalance(null);
      return;
    }
    async function fetchTokenBalance() {
      try {
        const res = await fetch(
          `/api/profile/${encodeURIComponent(session.user.profileID)}`
        );
        const data = await res.json();
        const tokensEarned = Math.floor(userPoints / 1000);
        const tokensSpent = data.success
          ? data.userExchanges.reduce((sum, ex) => sum + (ex.exchangeTokens || 0), 0)
          : 0;
        setTokenBalance(tokensEarned - tokensSpent);
      } catch (err) {
        console.error("[Header] Error fetching token balance:", err);
        setTokenBalance(null);
      }
    }
    fetchTokenBalance();
  }, [userPoints, session]);

  // timezone detection removed; now only in admin page

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
		<span className="text-sm text-gray-200">
		  {userPoints != null ? `${userPoints} pts` : ""}
		</span>
		<span className="text-sm text-gray-200">
		  {tokenBalance != null ? `${tokenBalance} tokens` : ""}
		</span>
		{/* ProfileID => link to /profile/[profileID] */}
		<Link href={`/profile/${profileID}`} className={pillLinkStyles}>
		  💀 {profileID}
		</Link>
		{/* Sign out moved to sidebar */}
	  </div>
	);
  }

  return (
	<header className="bg-gray-800 text-white shadow-md border-b border-gray-700">
	  <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
		{/* Single row: brand on left, nav on right */}
		<div className="flex items-center justify-between h-12">
		  {/* Brand and timezone */}
		  <div className="flex items-center">
			<button onClick={() => setCollapsed(!collapsed)} className="text-gray-200 hover:text-gray-300 transition-colors mr-4">
			  {collapsed ? '>>' : '<<'}
			</button>
			<Link href="/" className={linkBaseStyles}>
			  🏴‍☠️ Make The Take
			</Link>
			{/* timezone display removed; moved to admin page */}
		  </div>
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
