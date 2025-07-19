// File: /pages/admin/index.js
import { useSession, signOut } from "next-auth/react";
import { useState } from "react";

export default function AdminPage() {
  const { data: session } = useSession();
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [eventsResult, setEventsResult] = useState(null);

  // If we want to log out the current user:
  function handleForceLogout() {
	// signOut can optionally redirect the user to a callback URL
	signOut({ callbackUrl: "/" }); 
  }

  const handleFetchEvents = async () => {
    setLoadingEvents(true);
    try {
      const res = await fetch("/api/admin/fetchMlbEvents", { method: "POST" });
      const data = await res.json();
      setEventsResult(data);
    } catch (err) {
      setEventsResult({ success: false, error: err.message });
    } finally {
      setLoadingEvents(false);
    }
  };

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

  {/* Get MLB Events button */}
  <div className="mt-4">
    <button
      onClick={handleFetchEvents}
      disabled={loadingEvents}
      className="px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
    >
      {loadingEvents ? "Fetching..." : "Get MLB Events"}
    </button>
    {eventsResult && (
      <div className="mt-2">
        {eventsResult.success ? (
          <p className="text-green-600">Successfully processed {eventsResult.processedCount} events.</p>
        ) : (
          <p className="text-red-600">Error: {eventsResult.error}</p>
        )}
      </div>
    )}
  </div>
	</div>
  );
}
