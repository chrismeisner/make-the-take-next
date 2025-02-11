import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

export default function LeaderboardPage() {
  const [subjectIDs, setSubjectIDs] = useState([]);
  const [selectedSubject, setSelectedSubject] = useState('');
  const [leaderboard, setLeaderboard] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
 
  // Utility function to obscure the phone
  function obscurePhone(e164Phone) {
	const stripped = e164Phone.replace(/\D/g, "");
	let digits = stripped;
	if (digits.startsWith("1") && digits.length === 11) {
	  digits = digits.slice(1);
	}
	if (digits.length !== 10) {
	  return e164Phone;
	}
	const area = digits.slice(0, 3);
	const middle = digits.slice(3, 6);
	return `(${area}) ${middle} ****`;
  }

  useEffect(() => {
	fetch('/api/subjectIDs')
	  .then((res) => res.json())
	  .then((data) => {
		if (data.success) {
		  setSubjectIDs(data.subjectIDs || []);
		}
	  })
	  .catch((err) => console.error('[leaderboard] subjectIDs error =>', err));
  }, []);

  const fetchLeaderboard = useCallback((subjectID) => {
	setLoading(true);
	setError('');
	setLeaderboard([]);

	let url = '/api/leaderboard';
	if (subjectID) {
	  url += `?subjectID=${encodeURIComponent(subjectID)}`;
	}
 
	fetch(url)
	  .then((res) => res.json())
	  .then((data) => {
		if (!data.success) {
		  setError(data.error || 'Unknown error fetching leaderboard');
		} else {
		  setLeaderboard(data.leaderboard || []);
		}
		setLoading(false);
	  })
	  .catch((err) => {
		console.error('[leaderboard] fetch error =>', err);
		setError('Could not fetch leaderboard');
		setLoading(false);
	  });
  }, []);

  // On first load, fetch "All"
  useEffect(() => {
	fetchLeaderboard('');
  }, [fetchLeaderboard]);

  function handleSubjectChange(e) {
	const val = e.target.value;
	setSelectedSubject(val);
	fetchLeaderboard(val);
  }

  return (
	<div style={{ padding: '2rem' }}>
	  <h2>Subject Leaderboard</h2>

	  <div style={{ marginBottom: '1rem' }}>
		<label style={{ marginRight: '0.5rem' }}>Choose Subject:</label>
		<select value={selectedSubject} onChange={handleSubjectChange}>
		  <option value="">All</option>
		  {subjectIDs.map((id) => (
			<option key={id} value={id}>
			  {id}
			</option>
		  ))}
		</select>
	  </div>

	  {loading ? (
		<p>Loading leaderboard...</p>
	  ) : error ? (
		<div style={{ color: 'red' }}>{error}</div>
	  ) : leaderboard.length === 0 ? (
		<p>No data found for this subject.</p>
	  ) : (
		<table style={{ borderCollapse: 'collapse', width: '100%' }}>
		  <thead>
			<tr style={{ borderBottom: '1px solid #ccc' }}>
			  <th style={{ textAlign: 'left', padding: '0.5rem' }}>Phone</th>
			  <th style={{ textAlign: 'left', padding: '0.5rem' }}>Takes</th>
			  <th style={{ textAlign: 'left', padding: '0.5rem' }}>Points</th>
			  <th style={{ textAlign: 'left', padding: '0.5rem' }}>Record</th>
			</tr>
		  </thead>
		  <tbody>
			{leaderboard.map((item) => (
			  <tr key={item.phone} style={{ borderBottom: '1px solid #eee' }}>
				<td style={{ padding: '0.5rem' }}>
				  {item.profileID ? (
					<Link href={`/profile/${item.profileID}`}>
					  {obscurePhone(item.phone)}
					</Link>
				  ) : (
					obscurePhone(item.phone)
				  )}
				</td>
				<td style={{ padding: '0.5rem' }}>{item.count}</td>
				<td style={{ padding: '0.5rem' }}>{Math.round(item.points)}</td>
				<td style={{ padding: '0.5rem' }}>
				  {item.won}-{item.lost}
				</td>
			  </tr>
			))}
		  </tbody>
		</table>
	  )}
	</div>
  );
}
