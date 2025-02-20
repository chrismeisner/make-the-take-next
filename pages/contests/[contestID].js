// File: /pages/contests/[contestID].js

import React, { useEffect, useState } from "react";
import Head from "next/head";
import Link from "next/link";

/**
 * Renders a single Contest detail page.
 * Fetches the Contest data from /api/contests/[contestID].
 * Displays linked Packs as clickable cards (with cover images).
 * Also fetches & displays a leaderboard from /api/contests/[contestID]/leaderboard.
 * 
 * Leaderboard:
 * - Uses `profileID` instead of phone
 * - Links to /profile/[profileID]
 */
export default function ContestDetailPage({ contestData, error }) {
  // State for loading the leaderboard
  const [leaderboard, setLeaderboard] = useState([]);
  const [loadingLB, setLoadingLB] = useState(true);
  const [lbError, setLbError] = useState("");

  // When we have a valid contestData, fetch the leaderboard from /api/contests/[contestID]/leaderboard
  useEffect(() => {
	if (!contestData?.contestID) return;
	const fetchLB = async () => {
	  try {
		const res = await fetch(`/api/contests/${contestData.contestID}/leaderboard`);
		const data = await res.json();
		if (!res.ok || !data.success) {
		  throw new Error(data.error || "Could not fetch contest leaderboard");
		}
		setLeaderboard(data.leaderboard || []);
	  } catch (err) {
		setLbError(err.message);
	  } finally {
		setLoadingLB(false);
	  }
	};
	fetchLB();
  }, [contestData]);

  // If there's an error loading the main contest data, show that
  if (error) {
	return <div style={{ color: "red" }}>Error: {error}</div>;
  }
  if (!contestData) {
	return <div>No contest data found.</div>;
  }

  const {
	contestID,
	contestTitle,
	packs = [],
	// We are intentionally not displaying raw linkedPropIDs / linkedTakeIDs
  } = contestData;

  return (
	<div style={{ padding: "1rem" }}>
	  <Head>
		<title>{contestTitle} | Make The Take</title>
	  </Head>

	  <h1 style={{ fontSize: "2rem", fontWeight: "bold" }}>
		Contest: {contestTitle}
	  </h1>
	  <p style={{ marginBottom: "1rem", color: "#666" }}>
		Contest ID: <strong>{contestID}</strong>
	  </p>

	  {/* Section for linked Packs */}
	  <section style={{ marginBottom: "2rem" }}>
		<h2>Packs in this Contest</h2>
		{packs.length === 0 ? (
		  <p>No Packs linked yet.</p>
		) : (
		  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
			{packs.map((pack) => {
			  const coverUrl =
				pack.packCover && pack.packCover.length > 0
				  ? pack.packCover[0].url
				  : null;

			  return (
				<Link key={pack.airtableId} href={`/packs/${pack.packURL}`}>
				  <div
					className="border rounded bg-white p-4 shadow-sm"
					style={{ cursor: "pointer" }}
				  >
					{coverUrl && (
					  <img
						src={coverUrl}
						alt={pack.packTitle}
						className="w-full h-40 object-cover mb-2 rounded"
					  />
					)}
					<h3 className="text-lg font-semibold">{pack.packTitle}</h3>
					<p className="text-sm text-gray-600">
					  URL: {pack.packURL}
					</p>
				  </div>
				</Link>
			  );
			})}
		  </div>
		)}
	  </section>

	  {/* Leaderboard Section */}
	  <section style={{ marginTop: "3rem" }}>
		<h2>Contest Leaderboard</h2>
		{loadingLB ? (
		  <p>Loading leaderboard...</p>
		) : lbError ? (
		  <p style={{ color: "red" }}>Error: {lbError}</p>
		) : leaderboard.length === 0 ? (
		  <p>No data found for this contest’s leaderboard.</p>
		) : (
		  <table style={{ borderCollapse: "collapse", width: "100%" }}>
			<thead>
			  <tr style={{ borderBottom: "1px solid #ccc" }}>
				<th style={{ textAlign: "left", padding: "0.5rem" }}>
				  Profile
				</th>
				<th style={{ textAlign: "left", padding: "0.5rem" }}>Takes</th>
				<th style={{ textAlign: "left", padding: "0.5rem" }}>Points</th>
				<th style={{ textAlign: "left", padding: "0.5rem" }}>Record</th>
			  </tr>
			</thead>
			<tbody>
			  {leaderboard.map((item, idx) => {
				const { profileID, count, points, won, lost } = item;
				return (
				  <tr key={idx} style={{ borderBottom: "1px solid #eee" }}>
					<td style={{ padding: "0.5rem" }}>
					  {profileID ? (
						<Link
						  href={`/profile/${profileID}`}
						  className="text-blue-600 underline"
						>
						  {profileID}
						</Link>
					  ) : (
						"Unknown"
					  )}
					</td>
					<td style={{ padding: "0.5rem" }}>{count}</td>
					{/* Round points to 0 decimals */}
					<td style={{ padding: "0.5rem" }}>{Math.round(points)}</td>
					<td style={{ padding: "0.5rem" }}>
					  {won}-{lost}
					</td>
				  </tr>
				);
			  })}
			</tbody>
		  </table>
		)}
	  </section>
	</div>
  );
}

/**
 * SSR to load the contest from /api/contests/[contestID].
 * The leaderboard data is fetched client-side in a useEffect above.
 */
export async function getServerSideProps(context) {
  const { contestID } = context.params;
  if (!contestID) {
	return { notFound: true };
  }

  const proto = context.req.headers["x-forwarded-proto"] || "http";
  const host =
	context.req.headers["x-forwarded-host"] || context.req.headers.host;
  const fallbackOrigin = `${proto}://${host}`;
  const origin = process.env.SITE_URL || fallbackOrigin;

  try {
	const response = await fetch(`${origin}/api/contests/${contestID}`);
	const data = await response.json();
	if (!response.ok || !data.success) {
	  throw new Error(data.error || "Failed to fetch contest data");
	}

	return {
	  props: {
		contestData: data.contest,
	  },
	};
  } catch (err) {
	console.error("[ContestDetailPage] Error =>", err);
	return {
	  props: {
		error: err.message || "Could not load contest",
	  },
	};
  }
}
