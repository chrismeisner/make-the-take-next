// pages/profile/[profileID].js
import { useRouter } from 'next/router';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';

export default function ProfilePage() {
  const router = useRouter();
  const { profileID } = router.query;
  const { data: session } = useSession();
  const [profile, setProfile] = useState(null);
  const [userTakes, setUserTakes] = useState([]);
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

  if (loading) return <div>Loading profile...</div>;
  if (error) return <div style={{ color: 'red' }}>{error}</div>;
  if (!profile) return <div>Profile not found.</div>;

  const isOwnProfile = session?.user && session.user.profileID === profile.profileID;

  return (
	<div style={{ padding: '1rem' }}>
	  <h2>{isOwnProfile ? 'Your Profile' : 'User Profile'}</h2>
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

	  <p>
		<Link href="/" className="underline text-blue-600">
		  Back to Home
		</Link>
	  </p>
	</div>
  );
}
