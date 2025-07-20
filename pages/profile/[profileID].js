import { useRouter } from "next/router";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import Image from "next/image";

export default function ProfilePage() {
  const router = useRouter();
  const { profileID } = router.query;
  const { data: session } = useSession();

  const [profile, setProfile] = useState(null);
  const [userTakes, setUserTakes] = useState([]);
  const [userStats, setUserStats] = useState({ points: 0, wins: 0, losses: 0, pending: 0 });
  const [userPacks, setUserPacks] = useState([]);
  const [prizes, setPrizes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Fetch the profile data
  useEffect(() => {
	if (!profileID) return;
	async function fetchProfile() {
	  try {
		const res = await fetch(`/api/profile/${encodeURIComponent(profileID)}`);
		const data = await res.json();
		if (data.success) {
		  setProfile(data.profile);
		  if (data.userTakes) {
			const sortedTakes = data.userTakes.sort(
			  (a, b) => new Date(b.createdTime) - new Date(a.createdTime)
			);
			setUserTakes(sortedTakes);
			calculateUserStats(sortedTakes);
		  }
		  setUserPacks(data.userPacks || []);
		} else {
		  setError(data.error || "Error loading profile");
		}
	  } catch (err) {
		console.error("Error fetching profile:", err);
		setError("Error fetching profile");
	  } finally {
		setLoading(false);
	  }
	}
	fetchProfile();
  }, [profileID]);

  // Fetch available prizes
  useEffect(() => {
	async function fetchPrizes() {
	  try {
		const res = await fetch("/api/prizes");
		const data = await res.json();
		if (data.success) {
		  setPrizes(data.prizes);
		} else {
		  console.error("Failed to fetch prizes:", data.error);
		}
	  } catch (err) {
		console.error("Error fetching prizes:", err);
	  }
	}
	// Fetch prizes regardless of session (or conditionally, if needed)
	fetchPrizes();
  }, []);

  // Calculate user stats from their takes
  function calculateUserStats(takesArr) {
	let points = 0, wins = 0, losses = 0, pending = 0;
	takesArr.forEach((take) => {
	  points += take.takePTS || 0;
	  if (take.takeResult === "Won") wins++;
	  else if (take.takeResult === "Lost") losses++;
	  else if (take.takeResult === "Pending") pending++;
	});
	setUserStats({ points: Math.round(points), wins, losses, pending });
  }

  if (loading) return <div className="p-4">Loading profile...</div>;
  if (error) return <div className="p-4 text-red-600">{error}</div>;
  if (!profile) return <div className="p-4">Profile not found.</div>;

  const isOwnProfile = session?.user && session.user.profileID === profile.profileID;

  return (
	<div className="p-4 max-w-4xl mx-auto">
	  {/* Profile Header */}
	  <div className="flex items-center justify-between mb-4">
		<h2 className="text-2xl font-bold">
		  {isOwnProfile ? "Your Profile" : "User Profile"}
		</h2>
		{isOwnProfile && (
		  <button
			onClick={() => signOut()}
			className="px-3 py-1 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded"
		  >
			Log Out
		  </button>
		)}
	  </div>

	  {/* Favorite Team */}
	  {profile.profileTeamData ? (
		<div className="mb-4 text-sm text-gray-700">
		  <span className="font-semibold block mb-1">Favorite Team:</span>
		  <p className="font-medium">
			{profile.profileTeamData.teamName || "Team not set"}
		  </p>
		</div>
	  ) : (
		<p className="mb-4 text-sm text-gray-700">No favorite team selected.</p>
	  )}

	  {/* Profile Avatar */}
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

	  {/* Basic Profile Details */}
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

	  {/* User Stats */}
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

	  {/* Available Prizes */}
	  <h3 className="text-xl font-bold mt-6 mb-2">Available Prizes</h3>
	  {prizes.length === 0 ? (
		<p className="text-center">No prizes available at this time.</p>
	  ) : (
		<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
		  {prizes.map((prize) => (
			<PrizeCard key={prize.prizeID} prize={prize} />
		  ))}
		</div>
	  )}

	  {/* Packs Played In */}
	  <h3 className="text-xl font-bold mt-6 mb-2">Packs You've Played In</h3>
	  {userPacks.length === 0 ? (
		<p>You haven't participated in any packs yet.</p>
	  ) : (
		<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
		  {userPacks.map((pack) => (
			<Link
			  key={pack.id}
			  href={`/packs/${pack.packURL}`}
			  className="border rounded shadow-md bg-white overflow-visible p-2 block"
			>
			  <div
				className="aspect-square relative bg-blue-600 bg-cover bg-center"
				style={{
				  backgroundImage:
					pack.packCover && pack.packCover.length > 0
					  ? `url(${pack.packCover[0].url})`
					  : undefined,
				}}
			  >
				{!pack.packCover && (
				  <div className="flex items-center justify-center h-full">
					<span>No Cover</span>
				  </div>
				)}
			  </div>
			  <div className="p-4">
				<h2 className="text-lg font-semibold">
				  {pack.packTitle || "Untitled Pack"}
				</h2>
				{pack.eventTime && (
				  <p className="text-xs text-gray-500">
					Event: {new Date(pack.eventTime).toLocaleString()}
				  </p>
				)}
				{pack.packStatus && (
				  <p className="text-xs text-gray-500">
					Status: {pack.packStatus}
				  </p>
				)}
			  </div>
			</Link>
		  ))}
		</div>
	  )}

	  <p className="mt-4">
		<Link href="/" className="underline text-blue-600">
		  Back to Home
		</Link>
	  </p>
	</div>
  );
}

function PrizeCard({ prize }) {
  return (
	<div className="border rounded shadow-sm bg-white p-4">
	  {prize.prizeIMGs && prize.prizeIMGs.length > 0 && (
		<img
		  src={prize.prizeIMGs[0].url}
		  alt={`Prize ${prize.prizeTitle}`}
		  className="w-full h-32 object-cover rounded mb-2"
		/>
	  )}
	  <h2 className="text-lg font-semibold">{prize.prizeTitle}</h2>
	  <p className="text-sm text-gray-600">
		Points Required: <strong>{prize.prizePTS}</strong>
	  </p>
	  <p className="mt-2">
		<Link
		  href={`/prizes/${encodeURIComponent(prize.prizeID)}`}
		  className="inline-block text-blue-600 underline text-sm"
		>
		  View Details
		</Link>
	  </p>
	</div>
  );
}
