// File: /pages/profile/[profileID].js
import { useRouter } from "next/router";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import Image from "next/image";

// Modal variants
import PointsModal from "../../components/modals/PointsModal";
import PrizeModal from "../../components/modals/PrizeModal";
import TeamsModal from "../../components/modals/TeamsModal";

export default function ProfilePage() {
  const router = useRouter();
  const { profileID } = router.query;
  const { data: session } = useSession();

  // Profile-related states
  const [profile, setProfile] = useState(null);
  const [userTakes, setUserTakes] = useState([]);
  const [userStats, setUserStats] = useState({
	points: 0,
	wins: 0,
	losses: 0,
	pending: 0,
  });
  const [userPacks, setUserPacks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Modal states
  const [isPointsModalOpen, setIsPointsModalOpen] = useState(false);
  const [isPrizeModalOpen, setIsPrizeModalOpen] = useState(false);
  const [prizeData, setPrizeData] = useState(null);
  const [isTeamsModalOpen, setIsTeamsModalOpen] = useState(false);

  useEffect(() => {
	if (!profileID) return;

	async function fetchProfile() {
	  try {
		const res = await fetch(`/api/profile/${encodeURIComponent(profileID)}`);
		const data = await res.json();

		if (data.success) {
		  setProfile(data.profile);

		  const isOwnProfile =
			session?.user && session.user.profileID === data.profile.profileID;

		  // If own profile and no team selected, open the TeamsModal
		  if (isOwnProfile && !data.profile.profileTeamData) {
			setIsTeamsModalOpen(true);
		  }

		  const sortedTakes = (data.userTakes || []).sort((a, b) => {
			return new Date(b.createdTime) - new Date(a.createdTime);
		  });
		  setUserTakes(sortedTakes);
		  setUserPacks(data.userPacks || []);
		  calculateUserStats(sortedTakes);
		} else {
		  setError(data.error || "Error loading profile");
		}
	  } catch (err) {
		setError("Error fetching profile");
	  } finally {
		setLoading(false);
	  }
	}
	fetchProfile();

	// URL parameter checks for modals
	if (router.query.show === "points") {
	  setIsPointsModalOpen(true);
	} else if (router.query.show === "prize") {
	  fetchPrize();
	} else if (router.query.show === "teams") {
	  setIsTeamsModalOpen(true);
	}
  }, [profileID, router.query, session]);

  async function fetchPrize() {
	try {
	  const resp = await fetch("/api/prize");
	  const data = await resp.json();
	  if (data.success) {
		setPrizeData(data.prize);
		setIsPrizeModalOpen(true);
	  } else {
		console.error("[ProfilePage] fetchPrize error =>", data.error);
	  }
	} catch (err) {
	  console.error("[ProfilePage] fetchPrize exception =>", err);
	}
  }

  function calculateUserStats(takesArr) {
	let points = 0,
	  wins = 0,
	  losses = 0,
	  pending = 0;

	takesArr.forEach((take) => {
	  points += take.takePTS || 0;
	  if (take.takeResult === "Won") wins++;
	  else if (take.takeResult === "Lost") losses++;
	  else if (take.takeResult === "Pending") pending++;
	});

	points = Math.round(points);
	setUserStats({ points, wins, losses, pending });
  }

  async function handleTeamSelected(team) {
	try {
	  const resp = await fetch("/api/updateTeam", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		credentials: "same-origin",
		body: JSON.stringify({ team }),
	  });
	  const data = await resp.json();

	  if (data.success) {
		console.log("[ProfilePage] Team updated =>", team);
		fetchProfileAgain();
	  } else {
		console.error("[ProfilePage] updateTeam error =>", data.error);
	  }
	} catch (err) {
	  console.error("[ProfilePage] handleTeamSelected error =>", err);
	} finally {
	  setIsTeamsModalOpen(false);
	}
  }

  async function fetchProfileAgain() {
	if (!profileID) return;
	try {
	  const res = await fetch(`/api/profile/${encodeURIComponent(profileID)}`);
	  const data = await res.json();
	  if (data.success) {
		setProfile(data.profile);
	  }
	} catch (err) {
	  console.error("Could not refetch updated profile =>", err);
	}
  }

  if (loading) {
	return <div className="p-4">Loading profile...</div>;
  }
  if (error) {
	return <div className="p-4 text-red-600">{error}</div>;
  }
  if (!profile) {
	return <div className="p-4">Profile not found.</div>;
  }

  const isOwnProfile =
	session?.user && session.user.profileID === profile.profileID;

  return (
	<div className="p-4 max-w-4xl mx-auto">
	  {/* Modal Components */}
	  <PointsModal
		isOpen={isPointsModalOpen}
		onClose={() => setIsPointsModalOpen(false)}
		points={userStats.points}
	  />
	  <PrizeModal
		isOpen={isPrizeModalOpen}
		onClose={() => setIsPrizeModalOpen(false)}
		prize={prizeData}
	  />
	  <TeamsModal
		isOpen={isTeamsModalOpen}
		onClose={() => setIsTeamsModalOpen(false)}
		onTeamSelected={handleTeamSelected}
	  />

	  {/* Profile Title Row */}
	  <div className="flex items-center justify-between mb-4">
		<h2 className="text-2xl font-bold">
		  {isOwnProfile ? "Your Profile" : "User Profile"}
		</h2>
		{isOwnProfile && (
		  <>
			{/* Removed Edit Profile Link */}
			<button
			  onClick={() => signOut()}
			  className="px-3 py-1 text-sm bg-gray-200 hover:bg-gray-300 text-gray-800 rounded"
			>
			  Log Out
			</button>
		  </>
		)}
	  </div>

	  {/* Display the chosen team's info if any: profileTeamData */}
	  {profile.profileTeamData && (
		<div className="mb-4 text-sm text-gray-700">
		  <span className="font-semibold block mb-1">Favorite Team:</span>
		  <p className="font-medium">{profile.profileTeamData.teamName}</p>
		  {profile.profileTeamData.teamLogo &&
			profile.profileTeamData.teamLogo.length > 0 && (
			  <img
				src={profile.profileTeamData.teamLogo[0].url}
				alt="Team Logo"
				className="w-16 h-16 object-cover mt-1"
			  />
			)}
		</div>
	  )}

	  {/* Profile Avatar (if any) */}
	  {profile.profileAvatar && profile.profileAvatar[0]?.url && (
		<div className="mb-4 text-center">
		  <Image
			src={profile.profileAvatar[0].url}
			alt="Profile Avatar"
			width={120}
			height={120}
			className="rounded-full mx-auto"
		  />
		</div>
	  )}

	  <p>
		<strong>Profile ID:</strong> {profile.profileID}
	  </p>
	  <p>
		<strong>Mobile:</strong> {profile.profileMobile}
	  </p>
	  <p>
		<strong>Username:</strong> {profile.profileUsername || "N/A"}
	  </p>
	  <p>
		<strong>Created:</strong> {profile.createdTime}
	  </p>

	  <h3 className="text-xl font-bold mt-6 mb-2">Your Stats</h3>
	  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
		<div>
		  <strong className="block">Total Points</strong>
		  {userStats.points}
		</div>
		<div>
		  <strong className="block">Wins</strong>
		  {userStats.wins}
		</div>
		<div>
		  <strong className="block">Losses</strong>
		  {userStats.losses}
		</div>
		<div>
		  <strong className="block">Pending</strong>
		  {userStats.pending}
		</div>
	  </div>

	  <h3 className="text-xl font-bold mt-6 mb-3">
		Your Takes ({userTakes.length})
	  </h3>
	  {userTakes.length === 0 ? (
		<p>You haven't made any takes yet.</p>
	  ) : (
		<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
		  {userTakes.map((take) => {
			let resultStyles = "bg-gray-300 text-gray-800";
			if (take.takeResult === "Pending") {
			  resultStyles = "bg-yellow-100 text-yellow-800";
			} else if (take.takeResult === "Won") {
			  resultStyles = "bg-green-100 text-green-800";
			} else if (take.takeResult === "Lost") {
			  resultStyles = "bg-red-100 text-red-800";
			}
			const takePoints = Math.round(take.takePTS || 0);
			return (
			  <div
				key={take.airtableRecordId}
				className="border p-4 rounded shadow-sm bg-white"
			  >
				{take.takeContentImageUrls &&
				  take.takeContentImageUrls.length > 0 && (
					<div className="mb-2">
					  <img
						src={take.takeContentImageUrls[0]}
						alt="Take Content"
						className="w-full h-32 object-cover rounded"
					  />
					</div>
				  )}
				<h4 className="text-lg font-semibold mb-1">
				  {take.takeTitle || "No Title"}
				</h4>
				{take.propID && take.propTitle && (
				  <p className="text-sm text-gray-600">
					Prop:{" "}
					<Link
					  href={`/props/${take.propID}`}
					  className="text-blue-600 underline"
					>
					  {take.propTitle}
					</Link>
				  </p>
				)}
				<p className="text-sm mt-1 flex items-center gap-1">
				  Result:
				  <span
					className={`inline-block px-2 py-1 rounded-full text-xs font-semibold ${resultStyles}`}
				  >
					{take.takeResult || "Pending"}
				  </span>
				</p>
				<p className="text-sm">Points: {takePoints}</p>
				{take.subjectTitle && (
				  <p className="text-sm">
					Subject:{" "}
					<span className="text-gray-700">{take.subjectTitle}</span>
				  </p>
				)}
				<p className="text-xs text-gray-500 mt-1">
				  Created: {take.createdTime}
				</p>
				<Link
				  href={`/takes/${take.takeID}`}
				  className="inline-block mt-2 text-blue-600 underline text-sm"
				>
				  View Take Details
				</Link>
			  </div>
			);
		  })}
		</div>
	  )}

	  <h3 className="text-xl font-bold mt-6 mb-2">Packs You've Played In</h3>
	  {userPacks.length === 0 ? (
		<p>You haven't participated in any packs yet.</p>
	  ) : (
		<ul className="list-disc list-inside mb-4 text-blue-600">
		  {userPacks.map((pack) => (
			<li key={pack.id}>
			  <Link href={`/packs/${pack.packURL}`} className="underline">
				{pack.packURL}
			  </Link>
			</li>
		  ))}
		</ul>
	  )}

	  <p className="mt-4">
		<Link href="/" className="underline text-blue-600">
		  Back to Home
		</Link>
	  </p>
	</div>
  );
}
