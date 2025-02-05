// pages/index.js
import { useState, useEffect } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";

export default function HomePage() {
  const { data: session } = useSession();
  const [propsList, setPropsList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
	async function loadData() {
	  try {
		console.log("[HomePage] Fetching props...");
		const res = await fetch("/api/props");
		const data = await res.json();
		console.log("[HomePage] /api/props response:", data);

		if (!data.success) {
		  setError(data.error || "Unknown error fetching props");
		  setLoading(false);
		  return;
		}

		const filteredProps = (data.props || []).filter(
		  (prop) => prop.propStatus !== "archived"
		);
		setPropsList(filteredProps);
		setLoading(false);
	  } catch (err) {
		console.error("[HomePage] error:", err);
		setError("Could not fetch data");
		setLoading(false);
	  }
	}
	loadData();
  }, []);

  if (loading) return <div className="p-4">Loading props...</div>;
  if (error) return <div className="p-4 text-red-600">Error: {error}</div>;
  if (propsList.length === 0) return <div className="p-4">No props found.</div>;

  return (
	<div className="p-4">
	  <h2 className="text-2xl font-bold mb-4">All Propositions (v1)</h2>
	  <div className="space-y-6">
		{propsList.map((prop) => (
		  <div key={prop.propID} className="border p-4 rounded">
			<div className="flex items-center">
			  {prop.subjectLogoUrls && prop.subjectLogoUrls.length > 0 && (
				<div className="w-10 aspect-square overflow-hidden rounded mr-2">
				  <img
					src={prop.subjectLogoUrls[0]}
					alt={prop.subjectTitle || "Subject Logo"}
					className="w-full h-full object-cover"
				  />
				</div>
			  )}
			  <h3 className="text-xl font-semibold">
				<Link
				  href={`/props/${prop.propID}`}
				  className="text-blue-600 hover:underline"
				>
				  {prop.propTitle}
				</Link>
			  </h3>
			</div>
			{(prop.subjectTitle || prop.propStatus) && (
			  <p className="mt-1 text-sm text-gray-600">
				{prop.subjectTitle && <>Subject: {prop.subjectTitle}</>}
				{prop.subjectTitle && prop.propStatus && (
				  <span className="ml-4">Status: {prop.propStatus}</span>
				)}
				{!prop.subjectTitle && prop.propStatus && (
				  <>Status: {prop.propStatus}</>
				)}
			  </p>
			)}
			<p className="mt-1 text-gray-500">Created: {prop.createdAt}</p>
			<div className="mt-4">
			  {prop.contentImageUrls && prop.contentImageUrls.length > 0 ? (
				<Link href={`/props/${prop.propID}`}>
				  <div className="w-full max-w-sm aspect-video overflow-hidden bg-gray-300">
					<img
					  src={prop.contentImageUrls[0]}
					  alt="Prop content"
					  className="w-full h-full object-cover"
					/>
				  </div>
				</Link>
			  ) : (
				<Link href={`/props/${prop.propID}`}>
				  <div className="w-full max-w-sm aspect-video overflow-hidden bg-blue-500 text-white flex items-center justify-center font-bold">
					NEW IMAGE
				  </div>
				</Link>
			  )}
			</div>
			<p className="mt-2">{prop.propSummary}</p>
			<p className="mt-2 text-sm font-semibold">Make The Take:</p>
			<p>
			  <Link
				href={`/props/${prop.propID}`}
				className="text-blue-600 hover:underline"
			  >
				{prop.propShort}
			  </Link>
			</p>
			<div className="mt-4">
			  <p className="text-sm font-semibold">Your Take:</p>
			  {!session?.user ? (
				<p className="text-gray-600">
				  <Link
					href="/login?redirect=/"
					className="text-blue-600 underline"
				  >
					Log in
				  </Link>{" "}
				  to see your take.
				</p>
			  ) : (
				<p className="text-gray-600">
				  [v1: your take functionality here]
				</p>
			  )}
			</div>
		  </div>
		))}
	  </div>
	</div>
  );
}
