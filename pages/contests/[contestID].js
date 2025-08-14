// File: /pages/contests/[contestID].js

import React, { useEffect, useState } from "react";
import useLeaderboard from '../../hooks/useLeaderboard';
import { useSession } from "next-auth/react"; // <-- Import useSession
import Head from "next/head";
import PageHeader from "../../components/PageHeader";
import PageContainer from "../../components/PageContainer";
import Link from "next/link";
import PackPreview from "../../components/PackPreview";
import { useModal } from "../../contexts/ModalContext";

export default function ContestDetailPage({ contestData, error }) {
  // 1) NextAuth session
  const { data: session } = useSession();
  const isLoggedIn = !!session;
  const { openModal } = useModal();
  // Unified leaderboard hook
  const { leaderboard, loading: loadingLB, error: lbError } = useLeaderboard({ contestID: contestData?.contestID });

  // Removed SMS subscription UI

  // Countdown state
  const [timeLeft, setTimeLeft] = useState("");

  // Fetching leaderboard is now handled by useLeaderboard hook

  /*******************************
   * Dynamic second-by-second countdown
   *******************************/
  useEffect(() => {
	if (!contestData?.contestEndTime) return;

	const endTime = new Date(contestData.contestEndTime).getTime();

	function updateCountdown() {
	  const now = Date.now();
	  const diff = endTime - now;

	  if (diff <= 0) {
		setTimeLeft("Contest Ended!");
		return;
	  }

	  // Convert diff (ms) to days/hours/min/sec
	  const seconds = Math.floor(diff / 1000) % 60;
	  const minutes = Math.floor(diff / (1000 * 60)) % 60;
	  const hours = Math.floor(diff / (1000 * 60 * 60)) % 24;
	  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

	  let result = "";
	  if (days > 0) result += `${days}d `;
	  if (hours > 0 || days > 0) result += `${hours}h `;
	  if (minutes > 0 || hours > 0 || days > 0) result += `${minutes}m `;
	  result += `${seconds}s`;

	  setTimeLeft(result.trim());
	}

	updateCountdown();
	const intervalId = setInterval(updateCountdown, 1000);
	return () => clearInterval(intervalId);
  }, [contestData?.contestEndTime]);

  if (error) {
	return <div className="p-4 text-red-600">Error: {error}</div>;
  }
  if (!contestData) {
	return <div className="p-4 text-gray-600">No contest data found.</div>;
  }

  const {
	contestID,
	contestTitle,
	contestSummary,
	contestPrize,
	contestDetails,
	contestEndTime,
	contestCover = [],
	packs = [],
  } = contestData;

  const coverUrl = Array.isArray(contestCover) && contestCover.length > 0 ? contestCover[0].url : null;

  // Removed sign-up handler

  return (
	<div>
	  <Head>
		<title>{contestTitle} | Make The Take</title>
	  </Head>

      <PageHeader
        title={contestTitle}
        breadcrumbs={[
          { name: "Home", href: "/" },
          { name: "Contests", href: "/contests" },
          { name: contestTitle },
        ]}
        actions={
          <button
            onClick={() => {
              const url = typeof window !== 'undefined' ? window.location.href : '';
              openModal('shareContest', {
                contestTitle,
                contestSummary,
                contestUrl: url,
              });
            }}
            className="text-sm px-3 py-1.5 rounded border border-gray-300 text-gray-700 hover:bg-gray-50"
            aria-label="Share contest"
          >
            Share this contest
          </button>
        }
      />

      {/* ========== Leaderboard + Packs (Side-by-side on desktop) ========== */}
      <PageContainer>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Header details + Leaderboard */}
        <section>
          {/* Header Details moved into left column */}
          <div className="mb-6">
            {/* Title (shown again per request) */}
            <h1 className="text-2xl md:text-3xl font-bold mb-3">{contestTitle}</h1>

            {/* Cover image in left column as well */}
            {coverUrl && (
              <div className="mb-4">
                <img
                  src={coverUrl}
                  alt={contestTitle}
                  className="h-16 w-16 rounded object-cover border border-gray-200 shadow-sm"
                />
              </div>
            )}
            {/* Countdown */}
            {contestEndTime && (
              <div className="mb-4">
                {timeLeft === "Contest Ended!" ? (
                  <p className="text-red-600 text-lg font-semibold">
                    Contest Ended!
                  </p>
                ) : (
                  <>
                    <p className="text-gray-700 mb-1">Time Left:</p>
                    <p className="text-xl font-semibold text-blue-600">{timeLeft}</p>
                  </>
                )}
              </div>
            )}

            {/* Summary */}
            {contestSummary && (
              <div className="mb-3">
                <p className="text-sm md:text-base text-gray-700">{contestSummary}</p>
              </div>
            )}

            {/* Prize */}
            {contestPrize && (
              <div className="mb-4">
                <p className="text-sm text-green-700 font-medium">Prize: {contestPrize}</p>
              </div>
            )}

            {/* Contest Details */}
            {contestDetails && (
              <div className="mb-4">
                <p className="text-sm md:text-base whitespace-pre-wrap text-gray-700">
                  {contestDetails}
                </p>
              </div>
            )}

            {/* SMS subscription UI removed */}
          </div>

          <h2 className="text-xl font-bold mb-3">Contest Leaderboard</h2>
          {loadingLB ? (
            <p className="text-gray-500">Loading leaderboard...</p>
          ) : lbError ? (
            <p className="text-red-600">Error: {lbError}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="table-auto w-full border-collapse">
                <thead>
                  <tr className="border-b bg-gray-50">
                    {/* Rank Column */}
                    <th className="text-left py-2 px-3">Rank</th>
                    <th className="text-left py-2 px-3">Profile</th>
                    <th className="text-left py-2 px-3">Takes</th>
                    <th className="text-left py-2 px-3">Points</th>
                    <th className="text-left py-2 px-3">Record</th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-6 px-3 text-center text-gray-500">
                        No entries yet. Be the first to enter!
                      </td>
                    </tr>
                  ) : (
                    leaderboard.map((item, idx) => {
                      const rank = idx + 1;
                      const { profileID, count, points, won, lost } = item;
                      return (
                        <tr key={idx} className="border-b hover:bg-gray-50">
                          <td className="py-2 px-3 font-semibold">{rank}</td>
                          <td className="py-2 px-3">
                            {profileID ? (
                              <Link
                                href={'/profile/' + profileID}
                                className={"text-blue-600 underline " + (profileID === session?.user?.profileID ? "font-bold" : "")}
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
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Right: Packs */}
        <section>
          <h2 className="text-xl font-bold mb-2">Packs in this Contest</h2>
          {packs.length === 0 ? (
            <p className="text-gray-600">No Packs linked yet.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {packs.map((pack) => (
                <PackPreview key={pack.packID || pack.airtableId || pack.id} pack={pack} />
              ))}
            </div>
          )}
        </section>
        </div>
      </PageContainer>
	</div>
  );
}

/**
 * Standard SSR to load the contest data from /api/contests/[contestID].
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
