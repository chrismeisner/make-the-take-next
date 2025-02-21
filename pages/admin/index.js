// File: /pages/admin/index.js
import { useSession, signOut } from "next-auth/react";

export default function AdminPage() {
  const { data: session } = useSession();

  // If we want to log out the current user:
  function handleForceLogout() {
	// signOut can optionally redirect the user to a callback URL
	signOut({ callbackUrl: "/" }); 
  }

  // For example, if we only want to show it if the user is actually logged in:
  if (!session?.user) {
	return <div>Not logged in, no force-logout needed.</div>;
  }

  return (
	<div className="p-4">
	  <h1 className="text-2xl font-bold mb-4">Admin Tools</h1>
	  <p>Welcome, Admin.</p>

	  <button
		onClick={handleForceLogout}
		className="mt-4 px-3 py-2 bg-red-600 text-white rounded hover:bg-red-700"
	  >
		Force Log Out
	  </button>
	</div>
  );
}
