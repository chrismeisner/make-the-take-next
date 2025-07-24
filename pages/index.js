// File: /pages/index.js
import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/router";
import { useSession, signIn, getSession } from "next-auth/react";
import InputMask from "react-input-mask";
import Header from "../components/Header";
import LeaderboardTable from "../components/LeaderboardTable";
import Link from "next/link";
import PackPreview from "../components/PackPreview";

export default function LandingPage() {
  const router = useRouter();
  const { data: session } = useSession();

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

  // State for leaderboard (for logged-in users)
  const [leaderboard, setLeaderboard] = useState([]);
  const [loadingLeaderboard, setLoadingLeaderboard] = useState(false);

  // State for active packs (for logged-in users)
  const [activePacks, setActivePacks] = useState([]);
  const [loadingPacks, setLoadingPacks] = useState(false);

  // State for user takes (for logged-in users)
  const [userTakes, setUserTakes] = useState([]);
  // State and memo for sorting active packs by event time
  const [sortOption, setSortOption] = useState("eventTimeDesc");
  const sortedPacks = useMemo(() => {
    if (sortOption === "eventTimeAsc") {
      return [...activePacks].sort((a, b) => new Date(a.eventTime) - new Date(b.eventTime));
    } else if (sortOption === "eventTimeDesc") {
      return [...activePacks].sort((a, b) => new Date(b.eventTime) - new Date(a.eventTime));
    }
    return activePacks;
  }, [activePacks, sortOption]);

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

  // Fetch leaderboard if user is logged in
  useEffect(() => {
	if (session?.user) {
	  async function fetchLeaderboard() {
		console.log("🚀 [LandingPage] Fetching leaderboard...");
		setLoadingLeaderboard(true);
		try {
		  const res = await fetch("/api/leaderboard");
		  const data = await res.json();
		  console.log("📥 [LandingPage] Leaderboard data:", data);
		  if (data.success) {
			setLeaderboard(data.leaderboard);
		  }
		} catch (err) {
		  console.error("💥 [LandingPage] Error fetching leaderboard:", err);
		} finally {
		  setLoadingLeaderboard(false);
		}
	  }
	  fetchLeaderboard();
	}
  }, [session]);

  // Fetch active packs if user is logged in
  useEffect(() => {
	if (session?.user) {
	  async function fetchActivePacks() {
		console.log("🚀 [LandingPage] Fetching packs...");
		setLoadingPacks(true);
		try {
		  const res = await fetch("/api/packs");
		  const data = await res.json();
		  if (data.success && data.packs) {
			// Only include packs with status "active" or "graded"
			const active = data.packs.filter(pack => ["active","graded"].includes(String(pack.packStatus).toLowerCase()));
			setActivePacks(active);
			console.log("✅ [LandingPage] Active packs:", active);
		  }
		} catch (err) {
		  console.error("💥 [LandingPage] Error fetching packs:", err);
		} finally {
		  setLoadingPacks(false);
		}
	  }
	  fetchActivePacks();
	}
  }, [session]);

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
	<div className="min-h-screen w-screen bg-black text-white">
	  <Header />
	  <div className="p-4 max-w-4xl mx-auto">
		{session?.user ? (
		  <>
			{/* Active Packs Section */}
			<div className="mb-8">
			  <h2 className="text-2xl font-bold mb-4 text-center">Active Pack Drops</h2>
			  {/* Sort control for active packs */}
			  {!loadingPacks && activePacks.length > 0 && (
				<div className="flex justify-center mb-4">
				  <label htmlFor="sortOption" className="mr-2 text-sm font-medium text-gray-200">Sort by:</label>
				  <select
					id="sortOption"
					value={sortOption}
					onChange={(e) => setSortOption(e.target.value)}
					className="border rounded px-2 py-1 bg-black text-white"
				  >
					<option value="eventTimeDesc">Latest</option>
					<option value="eventTimeAsc">Coming Up Soonest</option>
				  </select>
				</div>
			  )}
			  {loadingPacks ? (
				<p className="text-center">Loading packs...</p>
			  ) : sortedPacks.length > 0 ? (
				<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
				  {sortedPacks.map((pack) => (
					<PackPreview key={pack.packID} pack={pack} userTakes={userTakes} />
				  ))}
				</div>
			  ) : (
				<p className="text-center">No active packs</p>
			  )}
			</div>
			{/* Leaderboard Section */}
			<div>
			  <h2 className="text-2xl font-bold mb-4 text-center">Leaderboard</h2>
			  {loadingLeaderboard ? (
				<p className="text-center">Loading leaderboard...</p>
			  ) : leaderboard && leaderboard.length > 0 ? (
				<LeaderboardTable leaderboard={leaderboard} />
			  ) : (
				<p className="text-center">No participants yet.</p>
			  )}
			</div>
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
