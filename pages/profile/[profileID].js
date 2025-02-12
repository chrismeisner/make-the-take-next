import { useRouter } from 'next/router';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import Image from 'next/image'; // for image optimization

export default function ProfilePage() {
  const router = useRouter();
  const { profileID } = router.query;
  const { data: session } = useSession();
  const [profile, setProfile] = useState(null);
  const [userTakes, setUserTakes] = useState([]);
  const [userStats, setUserStats] = useState({ points: 0, wins: 0, losses: 0 });
  const [userPacks, setUserPacks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
	if (!profileID) return;

	async function fetchProfile() {
	  try {
		const res = await fetch(`/api/profile/${encodeURIComponent(profileID)}`);
		const data = await res.json();
		if (data.success) {
		  setProfile(data.profile);
		  setUserTakes(data.userTakes || []);
		  setUserPacks(data.userPacks || []);
		  calculateUserStats(data.userTakes); // calculate stats when userTakes are fetched
		} else {
		  setError(data.error || 'Error loading profile');
		}
	  } catch (err) {
		setError('Error fetching profile');
	  } finally {
		setLoading(false);
	  }
	}
	fetchProfile();
  }, [profileID]);

  const calculateUserStats = (userTakes) => {
	let points = 0;
	let wins = 0;
	let losses = 0;
	let pending = 0;

	userTakes.forEach((take) => {
	  points += take.takePTS || 0;
	  if (take.takeResult === 'Won') {
		wins++;
	  } else if (take.takeResult === 'Lost') {
		losses++;
	  } else if (take.takeResult === 'Pending') {
		pending++;
	  }
	});

	setUserStats({ points, wins, losses, pending });
  };

  if (loading) return <div>Loading profile...</div>;
  if (error) return <div style={{ color: 'red' }}>{error}</div>;
  if (!profile) return <div>Profile not found.</div>;

  const isOwnProfile = session?.user && session.user.profileID === profile.profileID;

  return (
	<div style={{ padding: '1rem' }}>
	  <h2>{isOwnProfile ? 'Your Profile' : 'User Profile'}</h2>

	  {/* Profile Avatar */}
	  {profile.profileAvatar && profile.profileAvatar[0]?.url && (
		<div style={{ marginBottom: '1rem', textAlign: 'center' }}>
		  <Image
			src={profile.profileAvatar[0].url}
			alt="Profile Avatar"
			width={120}
			height={120}
			style={{ borderRadius: '50%' }} // Circle avatar
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
		<strong>Username:</strong> {profile.profileUsername || 'N/A'}
	  </p>
	  <p>
		<strong>Created:</strong> {profile.createdTime}
	  </p>

	  <h3>Your Stats</h3>
	  <p><strong>Total Points:</strong> {userStats.points}</p>
	  <p><strong>Wins:</strong> {userStats.wins}</p>
	  <p><strong>Losses:</strong> {userStats.losses}</p>
	  <p><strong>Pending:</strong> {userStats.pending}</p>

	  <h3>Your Takes ({userTakes.length})</h3>
	  {userTakes.length === 0 ? (
		<p>You haven't made any takes yet.</p>
	  ) : (
		<ul>
		  {userTakes.map((take) => (
			<li key={take.airtableRecordId}>
			  <Link href={`/takes/${take.takeID}`} className="underline text-blue-600">
				{take.takeID} - {take.propTitle || 'No Title'}
			  </Link>
			</li>
		  ))}
		</ul>
	  )}

	  <h3>Packs You've Played In</h3>
	  {userPacks.length === 0 ? (
		<p>You haven't participated in any packs yet.</p>
	  ) : (
		<ul>
		  {userPacks.map((pack) => (
			<li key={pack.id}>
			  <Link href={`/packs/${pack.packURL}`} className="underline text-blue-600">
				{pack.packURL}
			  </Link>
			</li>
		  ))}
		</ul>
	  )}

	  <p>
		<Link href="/" className="underline text-blue-600">
		  Back to Home
		</Link>
	  </p>
	</div>
  );
}
