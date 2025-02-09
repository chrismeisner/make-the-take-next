// File: /pages/packs/index.js
import { useState, useEffect } from "react";
import Link from "next/link";

export default function PacksIndexPage() {
  const [packs, setPacks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
	async function fetchPacks() {
	  try {
		const res = await fetch("/api/packs");
		const data = await res.json();
		if (!res.ok || !data.success) {
		  throw new Error(data.error || "Failed to load packs");
		}
		setPacks(data.packs || []);
	  } catch (err) {
		console.error("[PacksIndexPage] Error =>", err);
		setError(err.message || "Error fetching packs");
	  } finally {
		setLoading(false);
	  }
	}

	fetchPacks();
  }, []);

  if (loading) {
	return <div>Loading packs...</div>;
  }

  if (error) {
	return <div style={{ color: "red" }}>Error: {error}</div>;
  }

  return (
	<div style={{ padding: "1rem" }}>
	  <h1>All Packs</h1>
	  {packs.length === 0 ? (
		<p>No packs available.</p>
	  ) : (
		<ul>
		  {packs.map((pack) => (
			<li key={pack.packID} style={{ marginBottom: "0.5rem" }}>
			  {/* Link to /packs/[packURL] */}
			  <Link href={`/packs/${encodeURIComponent(pack.packURL)}`}>
				{pack.packTitle} ({pack.packURL})
			  </Link>
			</li>
		  ))}
		</ul>
	  )}
	</div>
  );
}
