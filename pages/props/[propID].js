// pages/props/[propID].js
import { useRouter } from 'next/router'
import { useState, useEffect } from 'react'
import Link from 'next/link'

export default function PropDetailPage() {
  const router = useRouter()
  const { propID } = router.query
  const [propData, setPropData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
	if (!propID) return

	async function fetchProp() {
	  try {
		console.log(`[PropDetailPage] Fetching data for propID: ${propID}`)
		const res = await fetch(`/api/prop?propID=${encodeURIComponent(propID)}`)
		if (!res.ok) {
		  const message = `HTTP error! status: ${res.status}`
		  console.error(message)
		  throw new Error(message)
		}
		const data = await res.json()
		console.log('[PropDetailPage] Fetched prop data:', data)
		if (!data.success) {
		  setError(data.error || 'Error loading prop.')
		} else {
		  setPropData(data)
		}
	  } catch (err) {
		console.error('[PropDetailPage] Exception while fetching prop data:', err)
		setError('Could not load prop data.')
	  } finally {
		setLoading(false)
	  }
	}
	fetchProp()
  }, [propID])

  if (loading) return <div>Loading prop...</div>
  if (error) return <div style={{ color: 'red' }}>{error}</div>
  if (!propData) return <div>Prop not found.</div>

  return (
	<div style={{ padding: '1rem', maxWidth: '800px', margin: '0 auto' }}>
	  <h1>{propData.propTitle}</h1>
	  {propData.subjectLogoUrl && (
		<img
		  src={propData.subjectLogoUrl}
		  alt={propData.subjectTitle || 'Subject Logo'}
		  style={{
			width: '80px',
			height: '80px',
			objectFit: 'cover',
			borderRadius: '4px',
		  }}
		/>
	  )}
	  {propData.contentImageUrl && (
		<div style={{ margin: '1rem 0' }}>
		  <img
			src={propData.contentImageUrl}
			alt="Prop Content"
			style={{ width: '100%', maxWidth: '600px', objectFit: 'cover' }}
		  />
		</div>
	  )}
	  <div style={{ color: '#555', marginBottom: '1rem' }}>
		{propData.subjectTitle && <p>Subject: {propData.subjectTitle}</p>}
		<p>Created: {propData.createdAt}</p>
	  </div>
	  <p style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>
		{propData.propSummary}
	  </p>
	  <Link href="/" className="underline text-blue-600">
		Back to Home
	  </Link>
	</div>
  )
}
