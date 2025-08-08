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
  const [userStats, setUserStats] = useState({ points: 0, wins: 0, losses: 0, pending: 0, pushes: 0 });
  const [userPacks, setUserPacks] = useState([]);
  const [userExchanges, setUserExchanges] = useState([]);
  const [achievementsValueTotal, setAchievementsValueTotal] = useState(0);
  const [awardsCount, setAwardsCount] = useState(0);
  const [prizes, setPrizes] = useState([]);
  const [tokensEarned, setTokensEarned] = useState(0);
  const [tokensSpent, setTokensSpent] = useState(0);
  const [tokensBalance, setTokensBalance] = useState(0);
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
			// Takes are already filtered server-side; sort and set
			const sortedTakes = data.userTakes.sort(
			  (a, b) => new Date(b.createdTime) - new Date(a.createdTime)
			);
			setUserTakes(sortedTakes);
			// Compute wins/losses/pushes and use server totalPoints
			const wins = sortedTakes.filter(t => (t.takeResult||'').toLowerCase() === 'won').length;
			const losses = sortedTakes.filter(t => (t.takeResult||'').toLowerCase() === 'lost').length;
			const pending = sortedTakes.filter(t => (t.takeResult||'').toLowerCase() === 'pending').length;
			const pushes = sortedTakes.filter(t => {
			  const r = (t.takeResult||'').toLowerCase();
			  return r === 'push' || r === 'pushed';
			}).length;
			setUserStats({ points: Math.round(data.totalPoints || 0), wins, losses, pending, pushes });
		  }
          setUserPacks(data.userPacks || []);
          setUserExchanges(data.userExchanges || []);
          setAwardsCount(data.awardsCount || 0);
          setAchievementsValueTotal(data.achievementsValueTotal || 0);
          // Tokens summary from API
          setTokensEarned(Number.isFinite(data.tokensEarned) ? data.tokensEarned : 0);
          setTokensSpent(Number.isFinite(data.tokensSpent) ? data.tokensSpent : 0);
          setTokensBalance(Number.isFinite(data.tokensBalance) ? data.tokensBalance : 0);
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

  // calculateUserStats is no longer needed; stats computed inline after fetch

  // Diamonds now map to achievementsValueTotal
  useEffect(() => {
    console.log('[ProfilePage] Achievements Value Total (Diamonds):', achievementsValueTotal);
  }, [achievementsValueTotal]);
  if (loading) return <div className="p-4">Loading profile...</div>;
  if (error) return <div className="p-4 text-red-600">{error}</div>;
  if (!profile) return <div className="p-4">Profile not found.</div>;
  const isOwnProfile = session?.user && session.user.profileID === profile.profileID;
  const packMap = userPacks.reduce((map, pack) => { map[pack.packID] = pack; return map; }, {});

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

	  {/* Quick Stats */}
	  <h3 className="text-xl font-bold mt-6 mb-2">Quick Stats</h3>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
		<div className="border rounded p-4 text-center">
		  <span className="text-2xl font-bold">{userStats.points}</span>
		  <div className="text-sm text-gray-600 mt-1">🦴 Bones</div>
          <div className="mt-1 text-xs text-gray-600">{`${userStats.wins}-${userStats.losses}-${userStats.pushes}`}</div>
		</div>
        <div className="border rounded p-4 text-center">
          <span className="text-2xl font-bold">{tokensBalance}</span>
          <div className="text-sm text-gray-600 mt-1">💎 Diamonds</div>
          <div className="mt-2 flex items-center justify-center gap-3">
            <Link href={`/profile/${encodeURIComponent(profileID)}/tokens`} className="text-xs text-blue-600 underline">
              View History
            </Link>
          </div>
        </div>
        <div className="border rounded p-4 text-center">
          <span className="text-2xl font-bold">{awardsCount}</span>
          <div className="text-sm text-gray-600 mt-1">🏆 Awards</div>
          <div className="mt-2">
            <Link href={`/profile/${encodeURIComponent(profileID)}/awards`} className="text-xs text-blue-600 underline">
              View Awards
            </Link>
          </div>
        </div>
	  </div>

      

      {/* Takes Table */}
      <h3 className="text-xl font-bold mt-6 mb-2">Your Takes</h3>
      {userTakes.length === 0 ? (
        <p>No takes yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full bg-white">
            <thead>
              <tr>
                <th className="px-4 py-2 text-left">Title</th>
                <th className="px-4 py-2 text-left">Event</th>
                <th className="px-4 py-2 text-left">Prop Result</th>
                <th className="px-4 py-2 text-left">Pack</th>
                <th className="px-4 py-2 text-left">Points</th>
                <th className="px-4 py-2 text-left">Result</th>
                <th className="px-4 py-2 text-left">Date</th>
              </tr>
            </thead>
            <tbody>
              {userTakes.map((take) => (
                <tr key={take.takeID}>
                  <td className="border px-4 py-2">{take.takeTitle || take.propTitle}</td>
                  <td className="border px-4 py-2">
                    {take.propLeague && take.propESPN ? (
                      <a
                        href={`https://www.espn.com/${take.propLeague}/game/_/gameId/${take.propESPN}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline text-blue-600"
                      >
                        {take.propEventMatchup}
                      </a>
                    ) : (
                      take.propEventMatchup || 'N/A'
                    )}
                  </td>
                  <td className="border px-4 py-2">{take.propResult || 'N/A'}</td>
                  <td className="border px-4 py-2">
                    {take.packIDs && take.packIDs.length > 0
                      ? take.packIDs.map(pid => packMap[pid]?.packTitle || pid).join(', ')
                      : 'N/A'}
                  </td>
                  <td className="border px-4 py-2">{Math.round(take.takePTS)}</td>
                  <td className="border px-4 py-2">
                    {(() => {
                      const result = take.propStatus === 'closed' ? 'Pending' : take.takeResult;
                      const rLower = result.toLowerCase();
                      let classes = 'bg-gray-100 text-gray-800';
                      if (rLower === 'won') classes = 'bg-green-100 text-green-800';
                      else if (rLower === 'lost') classes = 'bg-red-100 text-red-800';
                      else if (rLower === 'pending') classes = 'bg-yellow-100 text-yellow-800';
                      else if (rLower === 'push' || rLower === 'pushed') classes = 'bg-teal-100 text-teal-800';
                      return (
                        <span className={`inline-block px-2 py-1 text-xs font-semibold rounded-full ${classes}`}>
                          {result}
                        </span>
                      );
                    })()}
                  </td>
                  <td className="border px-4 py-2">{new Date(take.createdTime).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
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
