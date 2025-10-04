//pages/packs/[packURL]/leaderboard.js 
 
import { useRouter } from 'next/router';
// React state hooks are no longer needed here
import Link from 'next/link';
import LeaderboardTable from '../../../components/LeaderboardTable';
import useLeaderboard from '../../../hooks/useLeaderboard';

export default function PackLeaderboardPage() {
  const router = useRouter();
  const { packURL } = router.query; // e.g. "super-bowl"
  const { leaderboard, loading, error } = useLeaderboard({ packURL });

  // Obscure phone for privacy
  function obscurePhone(e164Phone) {
	if (!e164Phone || e164Phone === 'Unknown') return 'Unknown';
	const stripped = e164Phone.replace(/\D/g, '');
	if (stripped.length !== 10 && stripped.length !== 11) return e164Phone;
	const last4 = stripped.slice(-4);
	return `xxxx-${last4}`;
  }

  // Leaderboard data is now handled by useLeaderboard hook

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
	  <h2>Pack Leaderboard: {packURL}</h2>
      {leaderboard.length === 0 ? (
		<p>No data found for this pack’s leaderboard.</p>
	  ) : (
        <LeaderboardTable leaderboard={leaderboard} />
	  )}
	  <p style={{ marginTop: '1rem' }}>
		<Link href={`/packs/${packURL}`}>Back to Pack</Link>
	  </p>
	</div>
  );
}
