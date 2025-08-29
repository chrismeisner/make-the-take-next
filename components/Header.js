import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useSession } from "next-auth/react";
import { useModal } from "../contexts/ModalContext";
import HeaderGlobe from "./HeaderGlobe";

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

export default function Header({ collapsed, setCollapsed, sidebarItems = [] }) {
  const { data: session, status } = useSession();
  const { openModal } = useModal();
  const router = useRouter();
  const [userPoints, setUserPoints] = useState(null);
  const [tokenBalance, setTokenBalance] = useState(null);
  // timezone detection removed; now only in admin page

  useEffect(() => {
	console.log("[Header] Session status:", status);
	console.log("[Header] Session data:", session);

	async function fetchPoints() {
	  if (!session?.user?.profileID) {
		setUserPoints(null);
		return;
	  }
	  try {
		const resp = await fetch(`/api/profile/${encodeURIComponent(session.user.profileID)}`);
		const data = await resp.json();
		if (data.success) {
		  const roundedPts = Math.round(data.totalPoints || 0);
		  setUserPoints(roundedPts);
		} else {
		  console.log("[Header] /api/profile error =>", data.error);
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
  
  // Read cached token balance once and subscribe to updates from profile page
  useEffect(() => {
    if (!session?.user?.profileID) {
      setTokenBalance(null);
      return;
    }
    const key = `mt_tokensBalance:${session.user.profileID}`;
    try {
      if (typeof window !== 'undefined') {
        const cached = localStorage.getItem(key);
        if (cached != null && cached !== '') {
          const num = Number(cached);
          if (!Number.isNaN(num)) setTokenBalance(num);
        }
        const onUpdate = (evt) => {
          try {
            const d = evt?.detail || {};
            if (d.profileID === session.user.profileID && typeof d.tokensBalance === 'number') {
              setTokenBalance(d.tokensBalance);
            }
          } catch {}
        };
        window.addEventListener('mt_tokensBalanceUpdated', onUpdate);
        return () => window.removeEventListener('mt_tokensBalanceUpdated', onUpdate);
      }
    } catch {}
  }, [session]);

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
    const formattedUserPoints = userPoints != null ? userPoints.toLocaleString() : null;

	return (
      <div className="flex items-center space-x-3">
        {userPoints != null && (
          <Link href="/leaderboard" className={pillLinkStyles} title="Points (Leaderboard)" aria-label="View leaderboard">
            {formattedUserPoints} 🦴
          </Link>
        )}
        {tokenBalance != null && (
          <Link href="/marketplace" className={pillLinkStyles} title="Diamonds (Marketplace)" aria-label="Go to marketplace">
            {tokenBalance} 💎
          </Link>
        )}
		{/* ProfileID => link to /profile/[profileID] */}
		<Link href={`/profile/${profileID}`} className={pillLinkStyles}>
		  {profileID}
		</Link>
		{/* Sign out moved to sidebar */}
	  </div>
	);
  }

  const isSuperAdmin = Boolean(session?.user?.superAdmin);

  return (
	<header className="fixed top-0 inset-x-0 z-40 bg-gray-800 text-white shadow-md border-b border-gray-700">
	  <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
		<HeaderGlobe href="/" />
		{/* Single row: brand on left, nav on right */}
		<div className="flex items-center justify-between h-12">
		  {/* Brand and timezone */}
		  <div className="flex items-center">
            {/* Mobile hamburger opens nav modal (only for super admin) */}
            {isSuperAdmin && (
              <button
                className="lg:hidden text-gray-200 hover:text-gray-300 transition-colors mr-4"
                onClick={() => openModal("mobileNav", { items: sidebarItems })}
                aria-label="Open menu"
              >
                ☰
              </button>
            )}
			{/* Pirate flag replaced by decorative globe */}
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
