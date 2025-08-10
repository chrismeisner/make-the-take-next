// File: /pages/index.js
import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/router";
import { useSession, signIn, getSession } from "next-auth/react";
import InputMask from "react-input-mask";
import Link from "next/link";
// import PackPreview from "../components/PackPreview"; // removed with Active Pack Drops section

export default function LandingPage() {
  const router = useRouter();
  const { data: session } = useSession();
  // const hasFetchedPacks = useRef(false); // removed with Active Pack Drops section

  // States for login flow (when not logged in)
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [step, setStep] = useState("phone"); // "phone" or "code"
  const [code, setCode] = useState("");

  // States for teams (for login flow)
  const [teamsData, setTeamsData] = useState([]);
  const [loadingTeams, setLoadingTeams] = useState(true);
  const [teamError, setTeamError] = useState("");
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [agreed, setAgreed] = useState(true); // Fix for "agreed is not defined" error

  // Removed Active Pack Drops on dashboard

  // State for contests (for logged-in users)
  const [activeContest, setActiveContest] = useState(null);
  const [activeContestPacks, setActiveContestPacks] = useState([]);
  const [loadingContests, setLoadingContests] = useState(true);

  // State for user takes (for logged-in users)
  const [userTakes, setUserTakes] = useState([]);
  // Removed Active Pack Drops sorting/filter state and helpers

  // Removed Active Pack Drops derived lists

  // Helper: compute countdown like "Xd Xh Xm Xs" or "Ended!"
  function computeContestTimeLeft(endTime) {
    if (!endTime) return "";
    const now = Date.now();
    const end = new Date(endTime).getTime();
    const diff = end - now;
    if (diff <= 0) return "Ended!";
    const secs = Math.floor(diff / 1000) % 60;
    const mins = Math.floor(diff / (1000 * 60)) % 60;
    const hrs = Math.floor(diff / (1000 * 60 * 60)) % 24;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    let result = "";
    if (days > 0) result += `${days}d `;
    if (hrs > 0 || days > 0) result += `${hrs}h `;
    if (mins > 0 || hrs > 0 || days > 0) result += `${mins}m `;
    result += `${secs}s`;
    return result.trim();
  }

  // Fetch teams on mount (for login flow)
  useEffect(() => {
	async function fetchTeams() {
	  console.log("🚀 [LandingPage] Loading teams from Airtable...");
	  setLoadingTeams(true);
	  setTeamError("");
	  try {
		const res = await fetch("/api/teams");
		const data = await res.json();
		console.log("📥 [LandingPage] Received teams data:", data);
		if (data.success) {
		  const filtered = data.teams.filter((team) => team.teamType !== "league");
		  const sorted = filtered.sort((a, b) =>
			a.teamNameFull.localeCompare(b.teamNameFull)
		  );
		  setTeamsData(sorted);
		  console.log("✅ [LandingPage] Teams loaded:", sorted);
		} else {
		  setTeamError(data.error || "Failed to load teams");
		  console.error("❌ [LandingPage] Error loading teams:", data.error);
		}
	  } catch (err) {
		console.error("💥 [LandingPage] Error fetching teams:", err);
		setTeamError("Error fetching teams");
	  } finally {
		setLoadingTeams(false);
	  }
	}
	fetchTeams();
  }, []);

  // Removed Active Pack Drops fetching

  // Fetch contests if user is logged in
  useEffect(() => {
    if (!session?.user) return;
    let isActive = true;
    async function fetchContests() {
      setLoadingContests(true);
      try {
        const res = await fetch('/api/contests');
        const data = await res.json();
        if (res.ok && data.success && Array.isArray(data.contests)) {
          const openContests = data.contests.filter((c) => String(c.contestStatus).toLowerCase() === 'open');
          // sort by soonest end time first
          openContests.sort((a, b) => {
            const ta = a.contestEndTime ? new Date(a.contestEndTime).getTime() : Infinity;
            const tb = b.contestEndTime ? new Date(b.contestEndTime).getTime() : Infinity;
            return ta - tb;
          });
          if (isActive) setActiveContest(openContests[0] || null);
        } else if (isActive) {
          setActiveContest(null);
        }
      } catch (err) {
        if (isActive) setActiveContest(null);
      } finally {
        if (isActive) setLoadingContests(false);
      }
    }
    fetchContests();
    return () => { isActive = false; };
  }, [session]);

  // Fetch packs for the active contest (for dashboard card listing)
  useEffect(() => {
    let isMounted = true;
    async function fetchActiveContestPacks() {
      setActiveContestPacks([]);
      const id = activeContest?.contestID;
      if (!id) return;
      try {
        const res = await fetch(`/api/contests/${encodeURIComponent(id)}`);
        const data = await res.json();
        if (isMounted && res.ok && data.success && data.contest?.packs) {
          setActiveContestPacks(Array.isArray(data.contest.packs) ? data.contest.packs : []);
        }
      } catch (_) {
        if (isMounted) setActiveContestPacks([]);
      }
    }
    fetchActiveContestPacks();
    return () => { isMounted = false; };
  }, [activeContest?.contestID]);

  // Fetch user takes if logged in
  useEffect(() => {
	if (session?.user?.profileID) {
	  async function fetchUserTakes() {
		try {
		  const res = await fetch(`/api/userTakes?profileID=${session.user.profileID}`);
		  const data = await res.json();
		  if (data.success) {
			setUserTakes(data.takes);
			console.log("✅ [LandingPage] User takes:", data.takes);
		  } else {
			console.error("❌ [LandingPage] Error fetching user takes:", data.error);
		  }
		} catch (err) {
		  console.error("💥 [LandingPage] Error fetching user takes:", err);
		}
	  }
	  fetchUserTakes();
	}
  }, [session]);

  async function handlePhoneSubmit(e) {
	e.preventDefault();
	setError("");
	setMessage("");
	console.log("📞 [handlePhoneSubmit] Submitting phone:", phone);

	if (!phone) {
	  setError("Please enter your mobile number.");
	  return;
	}

	try {
	  // Normalize phone to E.164
	  const numeric = phone.replace(/\D/g, "");
	  let formattedPhone;
	  if (numeric.length === 10) {
		formattedPhone = `+1${numeric}`;
	  } else if (numeric.length === 11 && numeric.startsWith("1")) {
		formattedPhone = `+${numeric}`;
	  } else if (phone.startsWith("+")) {
		formattedPhone = phone;
	  } else {
		formattedPhone = phone;
	  }
	  console.log("🔄 [handlePhoneSubmit] Normalized phone:", formattedPhone);

	  const res = await fetch("/api/sendCode", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ phone: formattedPhone }),
	  });
	  const data = await res.json();
	  if (!data.success) {
		console.error("❌ [handlePhoneSubmit] Error response:", data);
		setError(data.error || "Failed to send verification code.");
	  } else {
		console.log("✅ [handlePhoneSubmit] Verification code sent successfully");
		setMessage("Verification code sent. Please check your SMS.");
		setStep("code");
	  }
	} catch (err) {
	  console.error("💥 [handlePhoneSubmit] Exception:", err);
	  setError("Error sending verification code. Please try again later.");
	}
  }

  async function handleCodeSubmit(e) {
	e.preventDefault();
	setError("");
	setMessage("");
	console.log("🔑 [handleCodeSubmit] Submitting verification code:", code);

	if (!code) {
	  setError("Please enter the verification code.");
	  return;
	}
	try {
	  const res = await fetch("/api/verifyCode", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ phone, code }),
	  });
	  const data = await res.json();
	  console.log("📥 [handleCodeSubmit] verifyCode response:", data);
	  if (!data.success) {
		console.error("❌ [handleCodeSubmit] Verification failed:", data);
		setError(data.error || "Verification failed.");
	  } else {
		console.log("✅ [handleCodeSubmit] Verification succeeded");
		const profileRes = await fetch("/api/createProfile", {
		  method: "POST",
		  headers: { "Content-Type": "application/json" },
		  body: JSON.stringify({ phone, team: selectedTeam }),
		});
		let profileData;
		try {
		  profileData = await profileRes.json();
		} catch (parseError) {
		  console.error("💥 [handleCodeSubmit] Error parsing profile response:", parseError);
		  setError("Server returned invalid response for profile creation.");
		  return;
		}
		console.log("📥 [handleCodeSubmit] createProfile response:", profileData);
		if (!profileData.success) {
		  console.error("❌ [handleCodeSubmit] Failed to create/update profile:", profileData);
		  setError(profileData.error || "Failed to create/update profile.");
		} else {
		  console.log("✅ [handleCodeSubmit] Profile updated/created successfully");
		  setMessage("Profile updated and verified successfully!");
		  // Sign in the user to update the session.
		  await signIn("credentials", { phone, code, redirect: false });
		  const profileID = profileData.profile.profileID;
		  console.log(`➡️ Redirecting to /profile/${profileID}`);
		  router.push(`/profile/${profileID}`);
		  // Optionally, trigger the welcome SMS message.
		  try {
			const msgRes = await fetch("/api/sendMessage", {
			  method: "POST",
			  headers: { "Content-Type": "application/json" },
			  body: JSON.stringify({ phone, team: selectedTeam }),
			});
			const msgData = await msgRes.json();
			console.log("📤 [handleCodeSubmit] sendMessage response:", msgData);
		  } catch (err) {
			console.error("💥 [handleCodeSubmit] Error sending welcome SMS:", err);
		  }
		}
	  }
	} catch (err) {
	  console.error("💥 [handleCodeSubmit] Exception:", err);
	  setError("Error verifying code. Please try again later.");
	}
  }

  // Dynamic entry title based on selected team.
  const entryTitle = selectedTeam
	? `Receive ${selectedTeam} Pack Challenge SMS notifications`
	: "Receive Pack Challenge SMS notifications";

  // Revised description with dummy legal links.
  const description = (
	<>
	  Enter your phone number to receive Pack Challenge SMS notifications for your chance to win!
	  Each challenge gives you a chance to showcase your predictions and win exciting prizes determined by us.
	  No purchase necessary. By signing up, you agree to our{" "}
	  <a href="/terms" className="underline text-blue-500">
		Terms of Service
	  </a>{" "}
	  and{" "}
	  <a href="/privacy" className="underline text-blue-500">
		Privacy Policy
	  </a>.
	</>
  );

  const consentText = selectedTeam
	? `Yes, sign me up for ${selectedTeam} SMS updates`
	: "Yes, sign me up for SMS updates";

  return (
	<div className="bg-white text-gray-900">
	  <div className="p-4 w-full max-w-4xl mx-auto">
		{session?.user ? (
		  <>
            {/* Active Contest Section */}
            {!loadingContests && activeContest && (
              <div className="mb-10">
                <h2 className="text-2xl font-bold mb-4 text-center">Active Contest</h2>
                {activeContest.contestID ? (
                  <Link
                    href={`/contests/${activeContest.contestID}`}
                    className="block group"
                  >
                    <div className="flex flex-col sm:flex-row gap-4 items-stretch border rounded-md shadow-sm overflow-hidden group-hover:shadow-md transition-shadow">
                      {/* Cover */}
                      <div className="w-full sm:w-1/3 aspect-square bg-gray-900">
                        {activeContest.contestCover?.length ? (
                          <img
                            src={activeContest.contestCover[0].url}
                            alt={activeContest.contestTitle}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full bg-gray-800" />
                        )}
                      </div>
                      {/* Content */}
                      <div className="flex-1 p-4 flex flex-col">
                        <h3 className="text-xl font-semibold mb-1">{activeContest.contestTitle || 'Untitled Contest'}</h3>
                        {activeContest.contestSummary && (
                          <p className="text-sm text-gray-700 mb-2">{activeContest.contestSummary}</p>
                        )}
                        <div className="flex items-center justify-between mb-3">
                          {activeContest.contestPrize ? (
                            <p className="text-sm text-green-700 font-medium">Prize: {activeContest.contestPrize}</p>
                          ) : <span />}
                          {activeContest.contestEndTime && (
                            <p className="text-sm text-red-600 font-semibold">
                              {computeContestTimeLeft(activeContest.contestEndTime)}
                            </p>
                          )}
                        </div>
                        {activeContestPacks.length > 0 && (
                          <div className="mt-1">
                            <p className="text-sm font-medium mb-1">Packs</p>
                            <div className="flex flex-wrap gap-2">
                              {activeContestPacks.map((p) => (
                                <span key={p.packURL || p.airtableId} className="inline-flex items-center px-2 py-1 text-xs rounded bg-gray-100 text-gray-700">
                                  {p.packTitle}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </Link>
                ) : (
                  <div className="flex flex-col sm:flex-row gap-4 items-stretch border rounded-md shadow-sm overflow-hidden">
                  {/* Cover */}
                  <div className="w-full sm:w-1/3 aspect-square bg-gray-900">
                    {activeContest.contestCover?.length ? (
                        <img
                          src={activeContest.contestCover[0].url}
                          alt={activeContest.contestTitle}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full bg-gray-800" />
                      )}
                  </div>
                  {/* Content */}
                  <div className="flex-1 p-4 flex flex-col">
                    <h3 className="text-xl font-semibold mb-1">{activeContest.contestTitle || 'Untitled Contest'}</h3>
                    {activeContest.contestSummary && (
                      <p className="text-sm text-gray-700 mb-2">{activeContest.contestSummary}</p>
                    )}
                    <div className="flex items-center justify-between mb-3">
                      {activeContest.contestPrize ? (
                        <p className="text-sm text-green-700 font-medium">Prize: {activeContest.contestPrize}</p>
                      ) : <span />}
                      {activeContest.contestEndTime && (
                        <p className="text-sm text-red-600 font-semibold">
                          {computeContestTimeLeft(activeContest.contestEndTime)}
                        </p>
                      )}
                    </div>
                    {activeContestPacks.length > 0 && (
                      <div className="mt-1">
                        <p className="text-sm font-medium mb-1">Packs</p>
                        <div className="flex flex-wrap gap-2">
                          {activeContestPacks.map((p) => (
                            <span key={p.packURL || p.airtableId} className="inline-flex items-center px-2 py-1 text-xs rounded bg-gray-100 text-gray-700">
                              {p.packTitle}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                )}
              </div>
            )}
            {/* Active Pack Drops section removed; visit /packs for the full explorer */}
          </>
		) : (
		  <>
			<p className="text-base font-medium mb-4 text-center">{entryTitle}</p>
			{step === "phone" ? (
			  <form onSubmit={handlePhoneSubmit} className="max-w-sm mx-auto text-center">
				<InputMask
				  mask="(999) 999-9999"
				  value={phone}
				  onChange={(e) => setPhone(e.target.value)}
				>
				  {() => (
					<input
					  type="tel"
					  placeholder="Enter your mobile number"
					  autoComplete="tel"
					  inputMode="numeric"
					  className="w-full px-3 py-2 mb-4 rounded text-black"
					/>
				  )}
				</InputMask>
				<div className="flex items-center justify-center mb-4">
				  <input
					type="checkbox"
					checked={agreed}
					onChange={(e) => setAgreed(e.target.checked)}
					className="mr-2"
				  />
				  <span className="text-sm">{consentText}</span>
				</div>
				<button
				  type="submit"
				  className="w-full px-4 py-2 bg-white text-black font-semibold rounded hover:bg-gray-300 transition-colors"
				>
				  Send Verification Code
				</button>
			  </form>
			) : (
			  <form onSubmit={handleCodeSubmit} className="max-w-sm mx-auto text-center">
				<input
				  type="text"
				  placeholder="Enter your verification code"
				  value={code}
				  onChange={(e) => setCode(e.target.value)}
				  className="w-full px-3 py-2 mb-4 rounded text-black"
				/>
				<button
				  type="submit"
				  className="w-full px-4 py-2 bg-white text-black font-semibold rounded hover:bg-gray-300 transition-colors"
				>
				  Verify Code
				</button>
			  </form>
			)}
			{error && <p className="mt-4 text-red-500 text-center">{error}</p>}
			{message && <p className="mt-4 text-green-500 text-center">{message}</p>}
			<p className="mt-6 text-sm text-gray-300 max-w-md mx-auto text-center">{description}</p>
		  </>
		)}
	  </div>
	</div>
  );
}
