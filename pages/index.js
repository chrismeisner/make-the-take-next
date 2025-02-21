// File: /pages/index.js
import { useModal } from "../contexts/ModalContext";
import { useSession } from "next-auth/react";
import Link from "next/link";

export default function ComingSoonPage() {
  const { data: session } = useSession();
  const { openModal } = useModal();

  function handleMembersAccess() {
	// This triggers the "membersAccess" modal
	openModal("membersAccess");
  }

  const isLoggedIn = !!session?.user;

  return (
	<div className="min-h-screen w-screen bg-black text-white flex items-center justify-center">
	  <div className="text-center">
		<h1 className="text-4xl sm:text-5xl font-extrabold mb-4">Coming Soon</h1>
		<p className="text-lg text-gray-200 mb-6">
		  We&apos;re building something amazing. Stay tuned.
		</p>

		{isLoggedIn ? (
		  // If logged in => show direct link to /contests
		  <Link
			href="/contests"
			className="inline-block px-4 py-2 bg-white text-black font-semibold rounded hover:bg-gray-300 transition-colors"
		  >
			You’re In!
		  </Link>
		) : (
		  // Else => show "Members Access" which triggers the modal
		  <button
			onClick={handleMembersAccess}
			className="px-4 py-2 bg-white text-black font-semibold rounded hover:bg-gray-300 transition-colors"
		  >
			Members Access
		  </button>
		)}
	  </div>
	</div>
  );
}
