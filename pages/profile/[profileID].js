// File: /pages/profile/[profileID].js
import { useRouter } from "next/router";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import Image from "next/image";

export default function ProfilePage() {
  const router = useRouter();
  const { profileID } = router.query;
  const { data: session } = useSession();
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

  useEffect(() => {
	if (!profileID) return;

	async function fetchProfile() {
	  try {
		const res = await fetch(`/api/profile/${encodeURIComponent(profileID)}`);
		const data = await res.json();
		if (data.success) {
		  setProfile(data.profile);

		  // Sort by createdTime descending
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
  }, [profileID]);

  const calculateUserStats = (takenArr) => {
	let points = 0;
	let wins = 0;
	let losses = 0;
	let pending = 0;

	takenArr.forEach((take) => {
	  points += take.takePTS || 0;
	  if (take.takeResult === "Won") wins++;
	  else if (take.takeResult === "Lost") losses++;
	  else if (take.takeResult === "Pending") pending++;
	});

	// Round points
	points = Math.round(points);
	setUserStats({ points, wins, losses, pending });
  };

  if (loading) return <div className="p-4">Loading profile...</div>;
  if (error) return <div className="p-4 text-red-600">{error}</div>;
  if (!profile) return <div className="p-4">Profile not found.</div>;

  const isOwnProfile =
	session?.user && session.user.profileID === profile.profileID;

  return (
	<div className="p-4 max-w-4xl mx-auto">
	  <h2 className="text-2xl font-bold mb-4">
		{isOwnProfile ? "Your Profile" : "User Profile"}
	  </h2>

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
		  {userTakes.map((take) => (
			<div
			  key={take.airtableRecordId}
			  className="border p-4 rounded shadow-sm bg-white"
			>
			  {/* Show first image from take.takeContentImageUrls (if any) */}
			  {take.takeContentImageUrls && take.takeContentImageUrls.length > 0 && (
				<div className="mb-2">
				  <img
					src={take.takeContentImageUrls[0]}
					alt="Take Content"
					className="w-full h-32 object-cover rounded"
				  />
				</div>
			  )}

			  {/* MAIN Title from the Takes table => takeTitle */}
			  <h4 className="text-lg font-semibold mb-1">
				{take.takeTitle || "No Title"}
			  </h4>

			  {/* Could also display the propTitle beneath it */}
			  {take.propTitle && (
				<p className="text-sm text-gray-600">
				  Prop: {take.propTitle}
				</p>
			  )}

			  <p className="text-sm text-gray-600">
				Take ID:{" "}
				<Link
				  href={`/takes/${take.takeID}`}
				  className="text-blue-600 underline"
				>
				  {take.takeID}
				</Link>
			  </p>

			  <p className="text-sm mt-1">Side: {take.propSide || "N/A"}</p>
			  <p className="text-sm">Result: {take.takeResult || "Pending"}</p>
			  <p className="text-sm">Points: {take.takePTS || 0}</p>

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
		  ))}
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
