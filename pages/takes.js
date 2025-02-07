import { useState, useEffect } from 'react';
import Link from 'next/link';

export default function TakesPage() {
  const [takes, setTakes] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
	async function fetchTakes() {
	  try {
		const res = await fetch('/api/takes');
		const data = await res.json();

		if (data.success) {
		  setTakes(data.takes); // Assuming 'takes' is an array in the response
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
	  {takes.length === 0 ? (
		<p>No takes available</p>
	  ) : (
		<ul>
		  {takes.map((take) => (
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
