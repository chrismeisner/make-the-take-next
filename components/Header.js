import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useSession } from "next-auth/react";
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
  const router = useRouter();
  // timezone detection removed; now only in admin page

  useEffect(() => {
	console.log("[Header] Session status:", status);
	console.log("[Header] Session data:", session);
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
    const profileID = session?.user?.profileID;

	return (
      <div className="flex items-center space-x-3">
        {/* ProfileID => link to /profile/[profileID] */}
		{profileID && (
		  <Link href={`/profile/${profileID}`} className={pillLinkStyles}>
			{profileID}
		  </Link>
		)}
		{/* Sign out moved to sidebar */}
	  </div>
	);
  }

  return (
	<header className="fixed top-0 inset-x-0 z-40 bg-gray-800 text-white shadow-md border-b border-gray-700">
	  <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
		<HeaderGlobe href="/" />
		{/* Single row: brand on left, nav on right */}
		<div className="flex items-center justify-between h-12">
		  {/* Brand and timezone */}
		  <div className="flex items-center">
			{/* Pirate flag replaced by decorative globe */}
			{/* timezone display removed; moved to admin page */}
		  </div>
		  <nav className="flex items-center space-x-4">
			{session?.user ? (
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
