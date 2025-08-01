// File: /pages/admin/index.js
import { useSession, signIn, signOut } from "next-auth/react";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useModal } from "../../contexts/ModalContext";

export default function AdminPage({ superAdminSecret }) {
  const { data: session } = useSession();
  const { openModal } = useModal();
  const [timezone, setTimezone] = useState("");

  useEffect(() => {
    if (typeof Intl !== "undefined" && Intl.DateTimeFormat) {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      setTimezone(tz);
    }
  }, []);

  async function handleSwitchSuperAdmin() {
    await signOut({ redirect: false });
    signIn("super-admin", {
      secret: superAdminSecret,
      callbackUrl: "/admin",
    });
  }
  const handleGradePacks = async () => {
    try {
      const res = await fetch("/api/admin/gradePacks", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        openModal("gradePacks", { packs: data.packs });
      } else {
        console.error("Grade Packs error:", data.error);
      }
    } catch (err) {
      console.error("Grade Packs fetch failed:", err);
    }
  };
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [eventsResult, setEventsResult] = useState(null);
  const [mlbDateOption, setMlbDateOption] = useState("Today");
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

  // Handler for fetching MLB events
  const handleFetchEvents = async () => {
    setLoadingEvents(true);
    try {
      // Compute date string based on selected option
      const dt = new Date();
      if (mlbDateOption === "Yesterday") dt.setDate(dt.getDate() - 1);
      else if (mlbDateOption === "Tomorrow") dt.setDate(dt.getDate() + 1);
      const dateStr = dt.toISOString().slice(0, 10).replace(/-/g, "");
      const res = await fetch("/api/admin/fetchMlbEvents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: dateStr }),
      });
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
	  {timezone && (
          <p className="text-xs text-gray-500 mb-4">Timezone: {timezone}</p>
        )}
	  <p>Welcome, Admin.</p>
	  <button
        onClick={handleSwitchSuperAdmin}
        className="mt-4 px-3 py-2 bg-yellow-600 text-white rounded hover:bg-yellow-700"
      >
        Switch to Super Admin
      </button>

	  <div className="mt-4 space-x-2">
        <Link href="/admin/create-pack">
          <button className="px-3 py-2 bg-green-600 text-white rounded hover:bg-green-700">
            Create New Pack
          </button>
        </Link>
        <Link href="/admin/create-event">
          <button className="px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
            Create New Event
          </button>
        </Link>
        <Link href="/admin/create-super-prop">
          <button className="px-3 py-2 bg-teal-600 text-white rounded hover:bg-teal-700">
            Create Super Prop
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
    <div className="flex items-center space-x-2">
      <select
        value={mlbDateOption}
        onChange={(e) => setMlbDateOption(e.target.value)}
        className="px-2 py-2 border rounded"
      >
        <option value="Yesterday">Yesterday</option>
        <option value="Today">Today</option>
        <option value="Tomorrow">Tomorrow</option>
      </select>
      <button
        onClick={handleFetchEvents}
        disabled={loadingEvents}
        className="px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
      >
        {loadingEvents ? "Fetching..." : "Get MLB Events"}
      </button>
    </div>
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
     {/* Grade Packs button */}
     <div className="mt-4">
       <button
         onClick={handleGradePacks}
         className="px-3 py-2 bg-purple-600 text-white rounded hover:bg-purple-700"
       >
         Grade Packs
       </button>
     </div>
    </div>
  );
}

export async function getServerSideProps() {
  return {
    props: {
      superAdminSecret: process.env.SUPERADMIN_SECRET || null,
    },
  };
}
