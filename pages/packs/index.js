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
	return <div style={{ color: "red" }}>{error}</div>;
  }

  return (
	<div style={{ padding: "1rem" }}>
	  <h1>Active Packs</h1>
	  {packs.length === 0 ? (
		<p>No active packs available.</p>
	  ) : (
		<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
		  {packs.map((pack) => (
			<Link key={pack.packID} href={`/packs/${pack.packURL}`}>
			  <div className="border rounded shadow-md bg-white overflow-hidden cursor-pointer">
				{/* Pack Cover */}
				<div
				  className={`h-48 bg-blue-600 ${!pack.packCover ? "flex justify-center items-center" : ""}`}
				  style={{
					backgroundImage: `url(${pack.packCover || ""})`,
					backgroundSize: "cover",
					backgroundPosition: "center",
				  }}
				>
				  {!pack.packCover && (
					<span className="text-white text-xl font-bold">No Cover</span>
				  )}
				</div>

				{/* Pack Title */}
				<div className="p-4">
				  <h2 className="text-lg font-semibold">{pack.packTitle}</h2>

				  {/* Pack Prize */}
				  {pack.packPrize && (
					<p className="text-xl text-green-500 flex items-center">
					  <span className="mr-2">🎖️ 1st place prize:</span>{pack.packPrize}
					</p>
				  )}

				  {/* Prize Summary */}
				  {pack.prizeSummary && (
					<p className="text-sm text-gray-600">{pack.prizeSummary}</p>
				  )}

				  {/* Pack Summary */}
				  {pack.packSummary && (
					<p className="text-sm text-gray-700 mt-2">{pack.packSummary}</p>
				  )}
				</div>
			  </div>
			</Link>
		  ))}
		</div>
	  )}
	</div>
  );
}
