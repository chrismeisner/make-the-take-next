// File: /pages/admin/index.js
import { useSession, signOut } from "next-auth/react";
import { useState } from "react";
import Link from "next/link";

export default function AdminPage() {
  const { data: session } = useSession();
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [eventsResult, setEventsResult] = useState(null);
  // State for updating MLB teams
  const [loadingTeams, setLoadingTeams] = useState(false);
  const [teamsResult, setTeamsResult] = useState(null);
  // State for updating NBA teams
  const [loadingNbaTeams, setLoadingNbaTeams] = useState(false);
  const [nbaTeamsResult, setNbaTeamsResult] = useState(null);
  // State for updating NFL teams
  const [loadingNflTeams, setLoadingNflTeams] = useState(false);
  const [nflTeamsResult, setNflTeamsResult] = useState(null);

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
  
  // Handler for updating MLB teams
  const handleUpdateTeams = async () => {
    setLoadingTeams(true);
    try {
      const res = await fetch("/api/admin/updateMlbTeams", { method: "POST" });
      const data = await res.json();
      setTeamsResult(data);
    } catch (err) {
      setTeamsResult({ success: false, error: err.message });
    } finally {
      setLoadingTeams(false);
    }
  };
  // Handler for updating NBA teams
  const handleUpdateNbaTeams = async () => {
    setLoadingNbaTeams(true);
    try {
      const res = await fetch("/api/admin/updateNbaTeams", { method: "POST" });
      const data = await res.json();
      setNbaTeamsResult(data);
    } catch (err) {
      setNbaTeamsResult({ success: false, error: err.message });
    } finally {
      setLoadingNbaTeams(false);
    }
  };
  // Handler for updating NFL teams
  const handleUpdateNflTeams = async () => {
    setLoadingNflTeams(true);
    try {
      const res = await fetch("/api/admin/updateNflTeams", { method: "POST" });
      const data = await res.json();
      setNflTeamsResult(data);
    } catch (err) {
      setNflTeamsResult({ success: false, error: err.message });
    } finally {
      setLoadingNflTeams(false);
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

	  <div className="mt-4">
		<Link href="/admin/create-pack">
		  <button className="px-3 py-2 bg-green-600 text-white rounded hover:bg-green-700">
			Create New Pack
		  </button>
		</Link>
	  </div>

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
      
      {/* Update MLB Teams button */}
      <div className="mt-4">
        <button
          onClick={handleUpdateTeams}
          disabled={loadingTeams}
          className="px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {loadingTeams ? "Updating MLB Teams..." : "Update MLB Teams"}
        </button>
        {teamsResult && (
          <div className="mt-2">
            {teamsResult.success ? (
              <p className="text-green-600">Successfully processed {teamsResult.processedCount} teams.</p>
            ) : (
              <p className="text-red-600">Error: {teamsResult.error}</p>
            )}
          </div>
        )}
      </div>
      {/* Update NBA Teams button */}
      <div className="mt-4">
        <button
          onClick={handleUpdateNbaTeams}
          disabled={loadingNbaTeams}
          className="px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {loadingNbaTeams ? "Updating NBA Teams..." : "Update NBA Teams"}
        </button>
        {nbaTeamsResult && (
          <div className="mt-2">
            {nbaTeamsResult.success ? (
              <p className="text-green-600">Successfully processed {nbaTeamsResult.processedCount} teams.</p>
            ) : (
              <p className="text-red-600">Error: {nbaTeamsResult.error}</p>
            )}
          </div>
        )}
      </div>
      {/* Update NFL Teams button */}
      <div className="mt-4">
        <button
          onClick={handleUpdateNflTeams}
          disabled={loadingNflTeams}
          className="px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {loadingNflTeams ? "Updating NFL Teams..." : "Update NFL Teams"}
        </button>
        {nflTeamsResult && (
          <div className="mt-2">
            {nflTeamsResult.success ? (
              <p className="text-green-600">Successfully processed {nflTeamsResult.processedCount} teams.</p>
            ) : (
              <p className="text-red-600">Error: {nflTeamsResult.error}</p>
            )}
          </div>
        )}
      </div>

	</div>
  );
}
