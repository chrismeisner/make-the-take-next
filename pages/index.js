// File: /pages/index.js
import { useState, useEffect } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import Toast from "../components/Toast";
import { useSession } from "next-auth/react";
import { useModal } from "../contexts/ModalContext";
import PackExplorer from "../components/PackExplorer";
import PageContainer from "../components/PageContainer";
import LeaderboardTable from "../components/LeaderboardTable";
import useLeaderboard from "../hooks/useLeaderboard";
import MarketplacePreview from "../components/MarketplacePreview";

export default function LandingPage({ packsData = [] }) {
  const router = useRouter();
  const { data: session } = useSession();
  const { openModal } = useModal();
  const [toastMessage, setToastMessage] = useState("");
  const { leaderboard, loading, error } = useLeaderboard();

  useEffect(() => {
    if (router.query.logout === "1") {
      setToastMessage("Logged out successfully");
    }
  }, [router.query.logout]);

  useEffect(() => {
    try {
      openModal("welcome", { contestHref: "/" });
    } catch (_) {}
  }, [openModal]);

  return (
    <div className="bg-white text-gray-900">
      <Head>
        <title>Packs | Make the Take</title>
      </Head>
      <div className="p-4 w-full">
        {toastMessage && (
          <Toast message={toastMessage} onClose={() => setToastMessage("")} />
        )}
        
        <PageContainer>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <section className="lg:col-span-2">
              <h1 className="text-xl md:text-2xl font-bold mb-3 md:mb-4">All Packs</h1>
              <PackExplorer packs={packsData} accent="green" />
            </section>

            <aside className="lg:col-span-1 lg:sticky lg:top-4 self-start">
              <h2 className="text-xl md:text-2xl font-bold mb-3 md:mb-4">All-Time Leaderboard</h2>
              {loading && (
                <p className="text-gray-600">Loading leaderboard…</p>
              )}
              {!loading && error && (
                <p className="text-red-600">{error}</p>
              )}
              {!loading && !error && (
                <LeaderboardTable leaderboard={(leaderboard || []).slice(0, 10)} />
              )}
              <div className="mt-3 text-right">
                <a href="/leaderboard" className="text-blue-600 underline">See full leaderboard</a>
              </div>

              <div className="mt-8">
                <MarketplacePreview limit={1} title="Marketplace" variant="sidebar" preferFeatured={true} />
              </div>
            </aside>
          </div>
        </PageContainer>
      </div>
    </div>
  );
}

export async function getServerSideProps(context) {
  const proto = context.req.headers["x-forwarded-proto"] || "http";
  const host =
    context.req.headers["x-forwarded-host"] || context.req.headers.host;
  const origin = process.env.SITE_URL || `${proto}://${host}`;

  try {
    const res = await fetch(`${origin}/api/packs`, {
      headers: {
        cookie: context.req.headers.cookie || "",
      },
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || "Failed to load packs");
    }
    // Hide packs with status: draft, archived, graded
    const allPacks = Array.isArray(data.packs) ? data.packs : [];
    const filteredPacks = allPacks.filter((p) => {
      const status = String(p?.packStatus || '').toLowerCase();
      return status !== 'draft' && status !== 'archived' && status !== 'graded';
    });
    // Sort: open/active first, then by packCloseTime ascending (soonest closing first).
    // Packs without close time go last within their status grouping.
    const statusRank = (p) => {
      const s = String(p?.packStatus || '').toLowerCase();
      if (s === 'open' || s === 'active') return 0;
      if (s === 'coming up') return 1;
      if (s === 'closed') return 2;
      if (s === 'completed') return 3;
      if (s === 'graded') return 4;
      return 5;
    };
    const getCloseMs = (p) => {
      const t = p?.packCloseTime;
      const ms = t ? new Date(t).getTime() : NaN;
      return Number.isFinite(ms) ? ms : Number.POSITIVE_INFINITY;
    };
    const sorted = filteredPacks.slice().sort((a, b) => {
      const sr = statusRank(a) - statusRank(b);
      if (sr !== 0) return sr;
      return getCloseMs(a) - getCloseMs(b);
    });
    return { props: { packsData: sorted } };
  } catch (error) {
    console.error("[HomePage] Error fetching packs:", error);
    return { props: { packsData: [] } };
  }
}
