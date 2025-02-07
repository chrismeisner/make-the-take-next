// pages/leaderboard.js
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

export default function LeaderboardPage() {
  const [subjectIDs, setSubjectIDs] = useState([]); // e.g. ["nba-trade-deadline", "nfl", ...]
  const [selectedSubject, setSelectedSubject] = useState(''); // '' means "All"
  const [leaderboard, setLeaderboard] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  // 1) On mount, load the distinct subject IDs
  useEffect(() => {
	fetch('/api/subjectIDs')
	  .then((res) => res.json())
	  .then((data) => {
		console.log('[LeaderboardPage] /api/subjectIDs =>', data);
		if (!data.success) {
		  console.error('Error fetching subjectIDs:', data.error);
		  return;
		}
		// Store the list of IDs
		setSubjectIDs(data.subjectIDs || []);
	  })
	  .catch((err) => {
		console.error('[LeaderboardPage] /api/subjectIDs error =>', err);
	  });
  }, []);

  // 2) A function to fetch the leaderboard for either "all" or a particular subject
  const fetchLeaderboard = useCallback((subjectID) => {
	setLoading(true);
	setError('');
	setLeaderboard([]);

	let url = '/api/leaderboard';
	if (subjectID) {
	  url += `?subjectID=${encodeURIComponent(subjectID)}`;
	}

	console.log('[LeaderboardPage] fetching leaderboard at url =>', url);

	fetch(url)
	  .then((res) => res.json())
	  .then((data) => {
		console.log('[LeaderboardPage] response =>', data);
		if (!data.success) {
		  setError(data.error || 'Unknown error fetching leaderboard');
		} else {
		  setLeaderboard(data.leaderboard || []);
		}
		setLoading(false);
	  })
	  .catch((err) => {
		console.error('[LeaderboardPage] fetch error =>', err);
		setError('Could not fetch leaderboard. Please try again later.');
		setLoading(false);
	  });
  }, []);

  // 3) On first load, fetch the "all" leaderboard
  useEffect(() => {
	fetchLeaderboard(''); // '' means no subject => all
  }, [fetchLeaderboard]);

  // 4) When a user picks a subject, update state and fetch leaderboard data again
  function handleSubjectChange(e) {
	const val = e.target.value;
	setSelectedSubject(val);
	fetchLeaderboard(val);
  }

  return (
	<div style={{ padding: '2rem' }}>
	  <h2>Subject Leaderboard</h2>

	  {/* Subject dropdown (with an "All" option) */}
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
		<div style={{ marginBottom: '1rem', color: 'red' }}>{error}</div>
	  ) : leaderboard.length === 0 ? (
		<p>No data found for this subject.</p>
	  ) : (
		<table style={{ borderCollapse: 'collapse', width: '100%' }}>
		  <thead>
			<tr style={{ borderBottom: '1px solid #ccc' }}>
			  <th style={{ textAlign: 'left', padding: '0.5rem' }}>Phone (E.164)</th>
			  <th style={{ textAlign: 'left', padding: '0.5rem' }}>Takes Count</th>
			  <th style={{ textAlign: 'left', padding: '0.5rem' }}>Points</th>
			</tr>
		  </thead>
		  <tbody>
			{leaderboard.map((item) => (
			  <tr key={item.phone} style={{ borderBottom: '1px solid #eee' }}>
				<td style={{ padding: '0.5rem' }}>
				  {item.profileID ? (
					<Link href={`/profile/${item.profileID}`}>
					  {item.phone}
					</Link>
				  ) : (
					item.phone
				  )}
				</td>
				<td style={{ padding: '0.5rem' }}>{item.count}</td>
				<td style={{ padding: '0.5rem' }}>{Math.round(item.points)}</td>
			  </tr>
			))}
		  </tbody>
		</table>
	  )}
	</div>
  );
}
