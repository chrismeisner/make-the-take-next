// File: /pages/admin/index.js
import { useSession, signIn, signOut } from "next-auth/react";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useModal } from "../../contexts/ModalContext";

export default function AdminPage({ superAdminSecret }) {
  const { data: session } = useSession();
  const { openModal } = useModal();
  // Render Twilio webhook settings on main Admin page
  const [timezone, setTimezone] = useState("");
  // Auto-grade moneyline props UI state
  const [gradingLeagues, setGradingLeagues] = useState([]);
  const [gradingLeague, setGradingLeague] = useState("");
  const [gradingDate, setGradingDate] = useState(() => new Date().toISOString().slice(0,10));
  const [gradingDryRun, setGradingDryRun] = useState(true);
  const [gradingLoading, setGradingLoading] = useState(false);
  const [gradingResult, setGradingResult] = useState(null);

  useEffect(() => {
    if (typeof Intl !== "undefined" && Intl.DateTimeFormat) {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      setTimezone(tz);
    }
  }, []);

  // Load leagues for grading dropdown
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/admin/eventLeagues');
        const data = await res.json();
        if (data.success) {
          setGradingLeagues(data.leagues || []);
        }
      } catch {}
    })();
  }, []);

  async function handleSwitchSuperAdmin() {
    try { console.log('[Admin] Button pressed: Switch to Super Admin'); } catch {}
    await signOut({ redirect: false });
    signIn("super-admin", {
      secret: superAdminSecret,
      callbackUrl: "/admin",
    });
  }
  const handleGradePacks = async () => {
    try { console.log('[Admin] Button pressed: Grade Packs'); } catch {}
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
 
  // Handler for fetching Props to grade
  const handleGradeProps = async () => {
    try { console.log('[Admin] Button pressed: Prop Grader'); } catch {}
    try {
      const res = await fetch("/api/admin/gradeProps", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        openModal("gradeProps", { props: data.props });
      } else {
        console.error("Grade Props error:", data.error);
      }
    } catch (err) {
      console.error("Grade Props fetch failed:", err);
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
  // State for fetching NFL events
  const [loadingNflEvents, setLoadingNflEvents] = useState(false);
  const [nflEventsResult, setNflEventsResult] = useState(null);
  // State for fetching NFL events (year/week)
  const [nflYear, setNflYear] = useState(2025);
  const [nflWeek, setNflWeek] = useState(1);
  // State for generating NFL Covers
  const [nflCoverLoading, setNflCoverLoading] = useState(false);
  const [nflCoverResult, setNflCoverResult] = useState(null);
  // State for generating Event Covers
  const [coverLeague, setCoverLeague] = useState("");
  const [coverDate, setCoverDate] = useState(() => new Date().toISOString().slice(0,10));
  const [coverLoading, setCoverLoading] = useState(false);
  const [coverResult, setCoverResult] = useState(null);
  const [sendingHello, setSendingHello] = useState(false);
  const [helloResult, setHelloResult] = useState("");
  const [helloProfiles, setHelloProfiles] = useState([]);
  const [helloSelectedProfile, setHelloSelectedProfile] = useState("");
  const [helloLoadingProfiles, setHelloLoadingProfiles] = useState(false);
  const [helloMessage, setHelloMessage] = useState("Hello");
  const [closingProps, setClosingProps] = useState(false);
  const [closePropsResult, setClosePropsResult] = useState(null);

  const handleCloseProps = async () => {
    try { console.log('[Admin] Button pressed: Close Props'); } catch {}
    setClosingProps(true);
    setClosePropsResult(null);
    try {
      const res = await fetch("/api/admin/closeProps", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setClosePropsResult(`Closed ${data.closedCount} props.`);
      } else {
        setClosePropsResult(`Error: ${data.error}`);
      }
    } catch (err) {
      setClosePropsResult(`Error: ${err.message}`);
    } finally {
      setClosingProps(false);
    }
  };

  // Handler to fetch graded packs without winners and open selection modal
  const handleGetPackWinners = async () => {
    try { console.log('[Admin] Button pressed: Get Pack Winners'); } catch {}
    try {
      const res = await fetch("/api/admin/packsWithoutWinners", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        openModal("getPackWinners", { packs: data.packs });
      } else {
        console.error("packsWithoutWinners error:", data.error);
      }
    } catch (err) {
      console.error("packsWithoutWinners fetch failed:", err);
    }
  };

  // Run auto-grade job for moneyline props
  const handleAutoGradeMoneylineProps = async () => {
    try { console.log('[Admin] Button pressed: Auto Grade Moneyline Props'); } catch {}
    setGradingLoading(true);
    setGradingResult(null);
    try {
      const params = new URLSearchParams();
      params.set('date', gradingDate);
      if (gradingLeague) params.set('league', gradingLeague.toLowerCase());
      params.set('type', 'moneyline');
      params.set('dryRun', gradingDryRun ? 'true' : 'false');
      // Pass browser timezone so backend can filter Events by local day correctly
      if (timezone) params.set('tz', timezone);
      const res = await fetch(`/api/admin/jobs/gradeMoneylineProps?${params.toString()}`, { method: 'POST' });
      const data = await res.json();
      setGradingResult(data);
    } catch (e) {
      setGradingResult({ success: false, error: e.message });
    } finally {
      setGradingLoading(false);
    }
  };

  // If we want to log out the current user:
  function handleForceLogout() {
    try { console.log('[Admin] Button pressed: Force Log Out'); } catch {}
	// signOut can optionally redirect the user to a callback URL
	signOut({ callbackUrl: "/" }); 
  }

  // Handler for fetching MLB events
  const handleFetchEvents = async () => {
    try { console.log('[Admin] Button pressed: Get MLB Events'); } catch {}
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
  // Handler for fetching NFL events
  const handleFetchNflEvents = async () => {
    try { console.log('[Admin] Button pressed: Get NFL Events'); } catch {}
    setLoadingNflEvents(true);
    try {
      const res = await fetch("/api/admin/fetchNflEvents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year: Number(nflYear), week: Number(nflWeek) }),
      });
      const data = await res.json();
      setNflEventsResult(data);
    } catch (err) {
      setNflEventsResult({ success: false, error: err.message });
    } finally {
      setLoadingNflEvents(false);
    }
  };
  
  // Handler for updating MLB teams
  const handleUpdateTeams = async () => {
    try { console.log('[Admin] Button pressed: Update MLB Teams'); } catch {}
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
    try { console.log('[Admin] Button pressed: Update NBA Teams'); } catch {}
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
    try { console.log('[Admin] Button pressed: Update NFL Teams'); } catch {}
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

  const sendHelloText = async () => {
    try { console.log('[Admin] Button pressed: Send Hello Text'); } catch {}
    setSendingHello(true);
    setHelloResult("");
    try {
      // If a profile is selected, send to that profile; otherwise send to current session user
      if (helloSelectedProfile) {
        const res = await fetch('/api/admin/sendHelloToProfile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ profileID: helloSelectedProfile, message: helloMessage || 'Hello' }),
        });
        const data = await res.json();
        if (data.success) {
          setHelloResult(`Hello text sent from ${data.from} to ${data.to}`);
        } else {
          setHelloResult(`Error: ${data.error}`);
        }
      } else {
        const res = await fetch("/api/admin/sendHelloText", { method: "POST" });
        const data = await res.json();
        if (data.success) {
          // Show both the from and to numbers in the success message
          setHelloResult(`Hello text sent from ${data.from} to ${data.to}`);
        } else {
          setHelloResult(`Error: ${data.error}`);
        }
      }
    } catch (err) {
      setHelloResult(`Error: ${err.message}`);
    } finally {
      setSendingHello(false);
    }
  };

  // Load profiles with phones for hello dropdown
  useEffect(() => {
    let ignore = false;
    const run = async () => {
      setHelloLoadingProfiles(true);
      try {
        const res = await fetch('/api/admin/listProfilesWithPhones?limit=100');
        const data = await res.json();
        if (!ignore && data?.success) {
          setHelloProfiles(Array.isArray(data.profiles) ? data.profiles : []);
        }
      } catch {}
      setHelloLoadingProfiles(false);
    };
    run();
    return () => { ignore = true; };
  }, []);

  // For example, if we only want to show it if the user is actually logged in:
  if (!session?.user) {
	return <div>Not logged in, no force-logout needed.</div>;
  }

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-1">Admin Tools</h1>
      {timezone && (
        <p className="text-xs text-gray-500 mb-4">Timezone: {timezone}</p>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Administration */}
        <section className="border rounded-lg p-4">
          <h2 className="text-lg font-semibold mb-3">Administration</h2>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleSwitchSuperAdmin}
              className="px-3 py-2 bg-yellow-600 text-white rounded hover:bg-yellow-700"
            >
              Switch to Super Admin
            </button>
            <button
              onClick={handleForceLogout}
              className="px-3 py-2 bg-red-600 text-white rounded hover:bg-red-700"
            >
              Force Log Out
            </button>
          </div>
        </section>

        {/* Content Creation */}
        <section className="border rounded-lg p-4">
          <h2 className="text-lg font-semibold mb-3">Content</h2>
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/contests/new">
              <button className="px-3 py-2 bg-pink-600 text-white rounded hover:bg-pink-700">
                Create New Contest
              </button>
            </Link>
            <Link href="/admin/create-pack">
              <button className="px-3 py-2 bg-green-600 text-white rounded hover:bg-green-700">
                Create New Pack
              </button>
            </Link>
            <Link href="/admin/create-pack?packType=vegas">
              <button className="px-3 py-2 bg-green-600 text-white rounded hover:bg-green-700">
                Create New Vegas Pack
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
            <Link href="/admin/props">
              <button className="px-3 py-2 bg-gray-600 text-white rounded hover:bg-gray-700">
                Manage Props
              </button>
            </Link>
            <Link href="/admin/vegas">
              <button className="px-3 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700">
                Vegas Odds Viewer
              </button>
            </Link>
            <Link href="/admin/odds-api-test">
              <button className="px-3 py-2 bg-gray-700 text-white rounded hover:bg-gray-800">
                Odds API Test
              </button>
            </Link>
            {/* Formula Builder removed */}
            <Link href="/admin/test-ai">
              <button className="px-3 py-2 bg-gray-800 text-white rounded hover:bg-gray-900">
                Test AI (Prompts)
              </button>
            </Link>
            <Link href="/admin/api-tester">
              <button className="px-3 py-2 bg-blue-950 text-white rounded hover:bg-blue-900">
                API Tester
              </button>
            </Link>
            <Link href="/admin/promo-links">
              <button className="px-3 py-2 bg-fuchsia-700 text-white rounded hover:bg-fuchsia-800">
                Promo Links
              </button>
            </Link>
            <Link href="/admin/marketplace">
              <button className="px-3 py-2 bg-orange-600 text-white rounded hover:bg-orange-700">
                Marketplace
              </button>
            </Link>
            <Link href="/admin/email-tester">
              <button className="px-3 py-2 bg-sky-700 text-white rounded hover:bg-sky-800">
                Email Tester
              </button>
            </Link>
            <Link href="/admin/awards">
              <button className="px-3 py-2 bg-emerald-600 text-white rounded hover:bg-emerald-700">
                Promo Cards
              </button>
            </Link>
            <Link href="/admin/prop-referrals">
              <button className="px-3 py-2 bg-emerald-700 text-white rounded hover:bg-emerald-800">
                Prop Referrals
              </button>
            </Link>
            <Link href="/admin/players">
              <button className="px-3 py-2 bg-emerald-700 text-white rounded hover:bg-emerald-800">
                Players
              </button>
            </Link>
            <Link href="/admin/redeem">
              <button className="px-3 py-2 bg-purple-600 text-white rounded hover:bg-purple-700">
                Redemptions
              </button>
            </Link>
            <Link href="/admin/location-test">
              <button className="px-3 py-2 bg-gray-900 text-white rounded hover:bg-black">
                Location Approximator
              </button>
            </Link>
          </div>
        </section>

        {/* Events Ingestion */}
        <section className="border rounded-lg p-4">
          <h2 className="text-lg font-semibold mb-3">Events</h2>
          <div className="space-y-3">
            {/* MLB Events */}
            <div>
              <div className="flex items-center gap-2">
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

            {/* Generate Event Covers */}
            <div className="pt-3 border-t mt-3">
              <h3 className="text-md font-semibold mb-2">Generate Event Covers</h3>
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700">League</label>
                  <select
                    value={coverLeague}
                    onChange={(e) => setCoverLeague(e.target.value)}
                    className="mt-1 px-3 py-2 border rounded"
                  >
                    <option value="">Select league</option>
                    {gradingLeagues.map((lg) => (
                      <option key={lg} value={lg}>{lg}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Date</label>
                  <input
                    type="date"
                    value={coverDate}
                    onChange={(e) => setCoverDate(e.target.value)}
                    className="mt-1 px-3 py-2 border rounded"
                  />
                </div>
                <button
                  onClick={async () => {
                    setCoverLoading(true);
                    setCoverResult(null);
                    try {
                      const params = new URLSearchParams();
                      params.set('date', coverDate);
                      if (coverLeague) params.set('league', String(coverLeague).toLowerCase());
                      if (timezone) params.set('tz', timezone);
                      console.log('[Admin] Generate Event Covers →', Object.fromEntries(params.entries()));
                      const res = await fetch(`/api/admin/jobs/generateEventCovers?${params.toString()}`, { method: 'POST' });
                      const data = await res.json();
                      console.log('[Admin] Generate Event Covers result →', data);
                      setCoverResult(data);
                    } catch (e) {
                      setCoverResult({ success: false, error: e.message });
                    } finally {
                      setCoverLoading(false);
                    }
                  }}
                  disabled={coverLoading || !coverLeague || !coverDate}
                  className={`px-3 py-2 rounded text-white ${coverLoading ? 'bg-gray-400' : 'bg-blue-600 hover:bg-blue-700'}`}
                >
                  {coverLoading ? 'Generating…' : 'Generate Covers'}
                </button>
              </div>
              {coverResult && (
                <div className="mt-2 text-sm">
                  {coverResult.success ? (
                    <p className="text-green-700">Updated {coverResult.updatedCount} of {coverResult.count} events.</p>
                  ) : (
                    <p className="text-red-700">Error: {coverResult.error}</p>
                  )}
                </div>
              )}
            </div>

            {/* NFL Events */}
            <div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2">
                  <label className="text-sm text-gray-700">Year</label>
                  <input
                    type="number"
                    min={2000}
                    max={2100}
                    value={nflYear}
                    onChange={(e) => setNflYear(e.target.value)}
                    className="px-2 py-2 border rounded w-24"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-sm text-gray-700">Week</label>
                  <select
                    value={nflWeek}
                    onChange={(e) => setNflWeek(e.target.value)}
                    className="px-2 py-2 border rounded"
                  >
                    {Array.from({ length: 23 }, (_, i) => i + 1).map((w) => (
                      <option key={w} value={w}>{`Week ${w}`}</option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={handleFetchNflEvents}
                  disabled={loadingNflEvents || !nflWeek || !nflYear}
                  className="px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                >
                  {loadingNflEvents ? "Fetching..." : "Get NFL Events"}
                </button>
                <button
                  onClick={async () => {
                    try { console.log('[Admin] Button pressed: Generate NFL Covers'); } catch {}
                    setNflCoverLoading(true);
                    setNflCoverResult(null);
                    try {
                      const res = await fetch('/api/admin/jobs/generateNflCovers', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ year: Number(nflYear), week: Number(nflWeek) }),
                      });
                      const data = await res.json();
                      setNflCoverResult(data);
                    } catch (e) {
                      setNflCoverResult({ success: false, error: e.message });
                    } finally {
                      setNflCoverLoading(false);
                    }
                  }}
                  disabled={nflCoverLoading || !nflWeek || !nflYear}
                  className="px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                >
                  {nflCoverLoading ? 'Generating...' : 'Generate NFL Covers'}
                </button>
              </div>
              {nflEventsResult && (
                <div className="mt-2">
                  {nflEventsResult.success ? (
                    <>
                      <p className='text-green-600'>Successfully processed {nflEventsResult.processedCount} events.</p>
                      <ul className='mt-2 space-y-1'>
                        {nflEventsResult.events.map(evt => (
                          <li key={evt.espnGameID}>
                            <Link href={`/teams/${evt.homeTeamSlug}`} className='text-blue-600 hover:underline'>
                              {evt.homeTeam}
                            </Link>
                            {" vs "}
                            <Link href={`/teams/${evt.awayTeamSlug}`} className='text-blue-600 hover:underline'>
                              {evt.awayTeam}
                            </Link>
                            {` on ${new Date(evt.eventTime).toLocaleString()}`}
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : (
                    <p className='text-red-600'>Error: {nflEventsResult.error}</p>
                  )}
                </div>
              )}
              {nflCoverResult && (
                <div className="mt-2">
                  {nflCoverResult.success ? (
                    <p className='text-green-600'>Updated {nflCoverResult.updatedCount} of {nflCoverResult.count} events for week {nflCoverResult.week}.</p>
                  ) : (
                    <p className='text-red-600'>Error: {nflCoverResult.error}</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Team Sync */}
        <section className="border rounded-lg p-4">
          <h2 className="text-lg font-semibold mb-3">Teams</h2>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleUpdateTeams}
              disabled={loadingTeams}
              className="px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {loadingTeams ? "Updating MLB Teams..." : "Update MLB Teams"}
            </button>
            <button
              onClick={handleUpdateNbaTeams}
              disabled={loadingNbaTeams}
              className="px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {loadingNbaTeams ? "Updating NBA Teams..." : "Update NBA Teams"}
            </button>
            <button
              onClick={handleUpdateNflTeams}
              disabled={loadingNflTeams}
              className="px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {loadingNflTeams ? "Updating NFL Teams..." : "Update NFL Teams"}
            </button>
          </div>
          <div className="space-y-1 mt-2 text-sm">
            {teamsResult && (
              <div>
                {teamsResult.success ? (
                  <p className="text-green-600">Successfully processed {teamsResult.processedCount} teams.</p>
                ) : (
                  <p className="text-red-600">Error: {teamsResult.error}</p>
                )}
              </div>
            )}
            {nbaTeamsResult && (
              <div>
                {nbaTeamsResult.success ? (
                  <p className="text-green-600">Successfully processed {nbaTeamsResult.processedCount} teams.</p>
                ) : (
                  <p className="text-red-600">Error: {nbaTeamsResult.error}</p>
                )}
              </div>
            )}
            {nflTeamsResult && (
              <div>
                {nflTeamsResult.success ? (
                  <p className="text-green-600">Successfully processed {nflTeamsResult.processedCount} teams.</p>
                ) : (
                  <p className="text-red-600">Error: {nflTeamsResult.error}</p>
                )}
              </div>
            )}
          </div>
        </section>

        {/* Grading & Winners */}
        <section className="border rounded-lg p-4">
          <h2 className="text-lg font-semibold mb-3">Grading & Winners</h2>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleGradePacks}
              className="px-3 py-2 bg-purple-600 text-white rounded hover:bg-purple-700"
            >
              Grade Packs
            </button>
            <button
              onClick={handleGradeProps}
              className="px-3 py-2 bg-purple-600 text-white rounded hover:bg-purple-700"
            >
              Prop Grader
            </button>
            <button
              onClick={handleGetPackWinners}
              className="px-3 py-2 bg-purple-600 text-white rounded hover:bg-purple-700"
            >
              Get Pack Winners
            </button>
            <button
              onClick={handleCloseProps}
              disabled={closingProps}
              className="px-3 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
            >
              {closingProps ? "Closing..." : "Close Props"}
            </button>
            <AwardTokensButton />
          </div>
          {closePropsResult && <p className="mt-2 text-sm">{closePropsResult}</p>}

          {/* Auto Grade Props removed */}
        </section>

        {/* Messaging */}
        <section className="border rounded-lg p-4">
          <h2 className="text-lg font-semibold mb-3">Messaging</h2>
          <div className="flex flex-wrap gap-2 items-center">
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-700">Send to</label>
              <select
                value={helloSelectedProfile}
                onChange={(e) => setHelloSelectedProfile(e.target.value)}
                className="px-2 py-2 border rounded min-w-[220px]"
              >
                <option value="">Myself (session phone)</option>
                {helloProfiles.map((p) => (
                  <option key={p.id} value={p.profile_id}>
                    {p.profile_id} {p.mobile_e164 ? `(${p.mobile_e164})` : ''}
                  </option>
                ))}
              </select>
              {helloLoadingProfiles && <span className="text-xs text-gray-500">Loading…</span>}
            </div>
            <input
              type="text"
              value={helloMessage}
              onChange={(e) => setHelloMessage(e.target.value)}
              className="px-2 py-2 border rounded"
              placeholder="Message"
            />
            <button
              onClick={sendHelloText}
              disabled={sendingHello}
              className="px-3 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50"
            >
              {sendingHello ? "Sending..." : "Send Hello Text"}
            </button>
            {helloResult && <p className="text-sm">{helloResult}</p>}
            <Link href="/admin/sms">
              <button className="px-3 py-2 bg-blue-700 text-white rounded hover:bg-blue-800">
                SMS Console
              </button>
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}

function AwardTokensButton() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [latestOnly, setLatestOnly] = useState(true);
  const [dryRun, setDryRun] = useState(true);

  const run = async () => {
    try { console.log('[Admin] Button pressed: Award Tokens'); } catch {}
    setRunning(true);
    setResult(null);
    try {
      const res = await fetch('/api/admin/awardTokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ latestOnly, dryRun }),
      });
      const data = await res.json();
      setResult(data);
    } catch (e) {
      setResult({ success: false, error: e.message });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={run}
        disabled={running}
        className="px-3 py-2 bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-50"
      >
        {running ? 'Running…' : (dryRun ? 'Preview Award Tokens' : 'Award Tokens')}
      </button>
      <label className="inline-flex items-center gap-1 text-sm text-gray-700">
        <input type="checkbox" checked={latestOnly} onChange={(e) => setLatestOnly(e.target.checked)} /> Latest only
      </label>
      <label className="inline-flex items-center gap-1 text-sm text-gray-700">
        <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} /> Dry run
      </label>
      {result && (
        <span className="text-sm ml-2">
          {result.success ? (
            dryRun ? `Would update ${result.toUpdate} rows.` : `Updated ${result.updatedCount} rows.`
          ) : (
            `Error: ${result.error}`
          )}
        </span>
      )}
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
