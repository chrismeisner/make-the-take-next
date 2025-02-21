//pages/packs/[packURL]/leaderboard.js 
 
import { useRouter } from 'next/router';
import { useState, useEffect } from 'react';
import Link from 'next/link';

export default function PackLeaderboardPage() {
  const router = useRouter();
  const { packURL } = router.query; // e.g. "super-bowl"
  const [leaderboard, setLeaderboard] = useState([]);
  const [packTitle, setPackTitle] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Obscure phone for privacy
  function obscurePhone(e164Phone) {
	if (!e164Phone || e164Phone === 'Unknown') return 'Unknown';
	const stripped = e164Phone.replace(/\D/g, '');
	if (stripped.length !== 10 && stripped.length !== 11) return e164Phone;
	const last4 = stripped.slice(-4);
	return `xxxx-${last4}`;
  }

  useEffect(() => {
	if (!packURL) return;
	async function fetchLeaderboard() {
	  try {
		const res = await fetch(`/api/packs/${encodeURIComponent(packURL)}/leaderboard`);
		const data = await res.json();
		if (!data.success) {
		  setError(data.error || 'Error fetching leaderboard');
		} else {
		  setLeaderboard(data.leaderboard || []);
		  setPackTitle(data.packTitle || '');
		}
	  } catch (err) {
		setError('Failed to load leaderboard');
	  } finally {
		setLoading(false);
	  }
	}
	fetchLeaderboard();
  }, [packURL]);

  if (loading) {
	return <div style={{ padding: '1rem' }}>Loading leaderboard...</div>;
  }

  if (error) {
	return (
	  <div style={{ padding: '1rem', color: 'red' }}>
		Error: {error}
	  </div>
	);
  }

  return (
	<div style={{ padding: '1rem' }}>
	  <h2>Pack Leaderboard: {packTitle || packURL}</h2>
	  {leaderboard.length === 0 ? (
		<p>No data found for this pack’s leaderboard.</p>
	  ) : (
		<table style={{ borderCollapse: 'collapse', width: '100%' }}>
		  <thead>
			<tr style={{ borderBottom: '1px solid #ccc' }}>
			  <th style={{ textAlign: 'left', padding: '0.5rem' }}>User</th>
			  <th style={{ textAlign: 'left', padding: '0.5rem' }}>Takes</th>
			  <th style={{ textAlign: 'left', padding: '0.5rem' }}>Points</th>
			  <th style={{ textAlign: 'left', padding: '0.5rem' }}>W-L</th>
			</tr>
		  </thead>
		  <tbody>
			{leaderboard.map((item, idx) => (
			  <tr key={idx} style={{ borderBottom: '1px solid #eee' }}>
				<td style={{ padding: '0.5rem' }}>
				  {item.profileID ? (
					<Link href={`/profile/${item.profileID}`}>
					  {obscurePhone(item.phone)}
					</Link>
				  ) : (
					obscurePhone(item.phone)
				  )}
				</td>
				<td style={{ padding: '0.5rem' }}>{item.takes}</td>
				<td style={{ padding: '0.5rem' }}>{item.points}</td>
				<td style={{ padding: '0.5rem' }}>
				  {item.won}-{item.lost}
				  {item.pending ? ` (Pending: ${item.pending})` : ''}
				</td>
			  </tr>
			))}
		  </tbody>
		</table>
	  )}
	  <p style={{ marginTop: '1rem' }}>
		<Link href={`/packs/${packURL}`}>Back to Pack</Link>
	  </p>
	</div>
  );
}
