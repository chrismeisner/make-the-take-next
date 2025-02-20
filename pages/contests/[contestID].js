// File: /pages/contests/[contestID].js

import React, { useEffect, useState } from "react";
import Head from "next/head";
import Link from "next/link";

export default function ContestDetailPage({ contestData, error }) {
  // Leaderboard state
  const [leaderboard, setLeaderboard] = useState([]);
  const [loadingLB, setLoadingLB] = useState(true);
  const [lbError, setLbError] = useState("");

  // SMS subscription state
  const [subscribeSMS, setSubscribeSMS] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [signupMessage, setSignupMessage] = useState("");

  // Fetch the leaderboard once we have a valid contestID
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

  // Basic error checks
  if (error) {
	return <div className="p-4 text-red-600">Error: {error}</div>;
  }
  if (!contestData) {
	return <div className="p-4 text-gray-600">No contest data found.</div>;
  }

  const {
	contestID,
	contestTitle,
	contestDetails,
	contestEndTime,
	packs = [],
  } = contestData;

  // Handler for the "Sign Up" CTA
  const handleSignUp = async () => {
	// Simple local validation
	if (!phoneNumber) {
	  setSignupMessage("Please enter a valid phone number.");
	  return;
	}
	// Clear old message
	setSignupMessage("");

	try {
	  // Example: POST to /api/subscribeSMS, omitted here
	  console.log("Signing up user phone =>", phoneNumber);
	  // simulate success
	  setSignupMessage("Success! You are signed up for SMS alerts.");
	} catch (err) {
	  console.error("Sign-up error =>", err);
	  setSignupMessage(`Error: ${err.message}`);
	}
  };

  return (
	<div>
	  <Head>
		<title>{contestTitle} | Make The Take</title>
	  </Head>

	  {/* Hero Section */}
	  <div className="bg-gray-100 py-10 px-4 text-center">
		<h1 className="text-3xl md:text-4xl font-bold mb-2">
		  {contestTitle}
		</h1>
		<p className="text-gray-600 mb-6">
		  Contest ID: <strong>{contestID}</strong>
		</p>

		{/* If there's an end time, display it in the hero */}
		{contestEndTime && (
		  <p className="text-gray-700 mb-4">
			Contest Ends:{" "}
			<strong>
			  {new Date(contestEndTime).toLocaleString()}
			</strong>
		  </p>
		)}

		{/* If there's contest details, show them below the heading */}
		{contestDetails && (
		  <div className="max-w-2xl mx-auto mb-4">
			<p className="text-sm md:text-base whitespace-pre-wrap text-gray-700">
			  {contestDetails}
			</p>
		  </div>
		)}

		{/* CTA to sign up for SMS alerts */}
		<div className="flex flex-col items-center mt-4 space-y-2">
		  <h3 className="text-lg font-semibold">Stay Updated!</h3>
		  <p className="text-sm text-gray-600">
			Get an SMS alert whenever new packs are released for this contest.
		  </p>
		  <div className="text-xs text-gray-500">
			By subscribing, you consent to receive text messages (SMS).
			Standard message and data rates may apply. Reply STOP at any time to unsubscribe.
		  </div>

		  {/* Phone input + Sign up button */}
		  <div className="flex flex-col md:flex-row items-start md:items-center gap-2 mt-2">
			<label className="block md:mr-2">
			  <span className="text-sm text-gray-700">Mobile Number:</span>
			  <input
				type="tel"
				value={phoneNumber}
				onChange={(e) => setPhoneNumber(e.target.value)}
				placeholder="+1 (555) 555-5555"
				className="mt-1 px-3 py-2 border border-gray-300 rounded w-48 md:w-56"
			  />
			</label>
			<button
			  onClick={handleSignUp}
			  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
			>
			  Sign Up
			</button>
		  </div>

		  {/* "I agree" checkbox below the phone and button */}
		  <div className="mt-2">
			<label className="inline-flex items-center gap-2">
			  <input
				type="checkbox"
				checked={subscribeSMS}
				onChange={(e) => setSubscribeSMS(e.target.checked)}
				className="h-4 w-4"
			  />
			  <span className="text-sm">
				I agree to receive text messages about new packs.
			  </span>
			</label>
		  </div>

		  {signupMessage && (
			<p
			  className={`mt-2 ${
				signupMessage.startsWith("Error") ? "text-red-600" : "text-green-600"
			  }`}
			>
			  {signupMessage}
			</p>
		  )}
		</div>
	  </div>

	  {/* Packs Section */}
	  <div className="p-4">
		<h2 className="text-xl font-bold mb-2">Packs in this Contest</h2>
		{packs.length === 0 ? (
		  <p className="text-gray-600">No Packs linked yet.</p>
		) : (
		  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
			{packs.map((pack) => {
			  const coverUrl =
				pack.packCover && pack.packCover.length > 0
				  ? pack.packCover[0].url
				  : null;

			  return (
				<Link key={pack.airtableId} href={`/packs/${pack.packURL}`}>
				  <div className="border rounded bg-white p-4 shadow-sm hover:shadow-md transition cursor-pointer">
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
	  </div>

	  {/* Leaderboard Section */}
	  <div className="p-4">
		<h2 className="text-xl font-bold mb-3">Contest Leaderboard</h2>
		{loadingLB ? (
		  <p className="text-gray-500">Loading leaderboard...</p>
		) : lbError ? (
		  <p className="text-red-600">Error: {lbError}</p>
		) : leaderboard.length === 0 ? (
		  <p className="text-gray-500">
			No data found for this contest’s leaderboard.
		  </p>
		) : (
		  <div className="overflow-x-auto">
			<table className="table-auto w-full border-collapse">
			  <thead>
				<tr className="border-b bg-gray-50">
				  <th className="text-left py-2 px-3">Profile</th>
				  <th className="text-left py-2 px-3">Takes</th>
				  <th className="text-left py-2 px-3">Points</th>
				  <th className="text-left py-2 px-3">Record</th>
				</tr>
			  </thead>
			  <tbody>
				{leaderboard.map((item, idx) => {
				  const { profileID, count, points, won, lost } = item;
				  return (
					<tr key={idx} className="border-b hover:bg-gray-50">
					  <td className="py-2 px-3">
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
					  <td className="py-2 px-3">{count}</td>
					  <td className="py-2 px-3">{Math.round(points)}</td>
					  <td className="py-2 px-3">
						{won}-{lost}
					  </td>
					</tr>
				  );
				})}
			  </tbody>
			</table>
		  </div>
		)}
	  </div>
	</div>
  );
}

// Standard SSR
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
