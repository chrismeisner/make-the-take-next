// pages/takes/index.js

import { useState, useEffect } from 'react';
import Link from 'next/link';

export default function TakesPage() {
  const [takesList, setTakesList] = useState([]);  // Updated variable name for clarity
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
	async function fetchTakes() {
	  try {
		const res = await fetch('/api/takes');
		const data = await res.json();

		if (data.success) {
		  setTakesList(data.takes);  // Updated state variable for clarity
		} else {
		  setError('Failed to load takes');
		}
	  } catch (err) {
		console.error('Error fetching takes:', err);
		setError('Error fetching takes');
	  } finally {
		setLoading(false);
	  }
	}

	fetchTakes();
  }, []);

  if (loading) {
	return <div>Loading takes...</div>;
  }

  if (error) {
	return <div style={{ color: 'red' }}>{error}</div>;
  }

  return (
	<div>
	  <h1>Takes List</h1>
	  {takesList.length === 0 ? (  // Updated to use takesList
		<p>No takes available</p>
	  ) : (
		<ul>
		  {takesList.map((take) => (  // Updated to use takesList
			<li key={take.airtableId}>
			  <Link href={`/takes/${take.takeID}`}>
				{take.propTitle || 'Unnamed Prop'} - {take.propSide || 'No Side'}
			  </Link>
			</li>
		  ))}
		</ul>
	  )}
	</div>
  );
}
