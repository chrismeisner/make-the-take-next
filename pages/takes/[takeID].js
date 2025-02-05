// pages/takes/[takeID].js
import { useRouter } from 'next/router'
import { useState, useEffect } from 'react'
import Link from 'next/link'

export default function TakePage() {
  const router = useRouter()
  const { takeID } = router.query
  const [takeData, setTakeData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
	if (!takeID) return
	async function fetchTake() {
	  try {
		const res = await fetch(`/api/takes/${takeID}`)
		const data = await res.json()
		if (!data.success) {
		  setError(data.error || 'Error loading take.')
		} else {
		  setTakeData(data)
		}
	  } catch (err) {
		setError('Could not fetch take data.')
	  } finally {
		setLoading(false)
	  }
	}
	fetchTake()
  }, [takeID])

  if (loading) return <div>Loading take...</div>
  if (error) return <div style={{ color: 'red' }}>{error}</div>
  if (!takeData || !takeData.take) return <div>Take not found.</div>

  const { take, prop } = takeData

  return (
	<div style={{ padding: '1rem' }}>
	  <h2>Take Details (v1)</h2>
	  <section style={{ border: '1px solid #ccc', padding: '1rem', marginBottom: '1rem' }}>
		<h3>Take Info</h3>
		<p><strong>Take ID:</strong> {take.takeID}</p>
		<p><strong>Prop ID:</strong> {take.propID}</p>
		<p><strong>Chosen Side:</strong> {take.propSide}</p>
		<p><strong>Created:</strong> {take.createdTime}</p>
	  </section>
	  {prop && (
		<section style={{ border: '1px solid #ccc', padding: '1rem', marginBottom: '1rem' }}>
		  <h3>Prop Info</h3>
		  <p><strong>Prop ID:</strong> {prop.propID}</p>
		  <p><strong>Description:</strong> {prop.propShort}</p>
		  <p><strong>Status:</strong> {prop.propStatus}</p>
		</section>
	  )}
	  <Link href="/" className="underline text-blue-600">
		Back to Home
	  </Link>
	</div>
  )
}
