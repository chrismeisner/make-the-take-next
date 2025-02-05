// pages/leaderboard.js
import { useState, useEffect } from 'react'
import Link from 'next/link'

export default function LeaderboardPage() {
  const [leaderboard, setLeaderboard] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
	async function fetchLeaderboard() {
	  try {
		const res = await fetch('/api/leaderboard')
		const data = await res.json()
		if (data.success) {
		  setLeaderboard(data.leaderboard)
		} else {
		  setError(data.error || 'Error fetching leaderboard')
		}
	  } catch (err) {
		setError('Error fetching leaderboard')
	  } finally {
		setLoading(false)
	  }
	}
	fetchLeaderboard()
  }, [])

  if (loading) return <div>Loading leaderboard...</div>
  if (error) return <div style={{ color: 'red' }}>{error}</div>

  return (
	<div style={{ padding: '2rem' }}>
	  <h2>Leaderboard (v1)</h2>
	  {leaderboard.length === 0 ? (
		<p>No data found.</p>
	  ) : (
		<table style={{ borderCollapse: 'collapse', width: '100%' }}>
		  <thead>
			<tr style={{ borderBottom: '1px solid #ccc' }}>
			  <th style={{ textAlign: 'left', padding: '0.5rem' }}>Phone</th>
			  <th style={{ textAlign: 'left', padding: '0.5rem' }}>Takes Count</th>
			  <th style={{ textAlign: 'left', padding: '0.5rem' }}>Points</th>
			</tr>
		  </thead>
		  <tbody>
			{leaderboard.map((item) => (
			  <tr key={item.phone} style={{ borderBottom: '1px solid #eee' }}>
				<td style={{ padding: '0.5rem' }}>
				  {item.profileID ? (
					<Link href={`/profile/${item.profileID}`} className="underline text-blue-600">
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
  )
}
