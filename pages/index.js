// File: /pages/index.js
import { useState, useEffect } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import Toast from "../components/Toast";
import { useSession } from "next-auth/react";
import { useModal } from "../contexts/ModalContext";
import PackExplorer from "../components/PackExplorer";
import PageContainer from "../components/PageContainer";

export default function LandingPage({ packsData = [] }) {
  const router = useRouter();
  const { data: session } = useSession();
  const { openModal } = useModal();
  const [toastMessage, setToastMessage] = useState("");

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
      <div className="p-4 w-full max-w-4xl mx-auto">
        {toastMessage && (
          <Toast message={toastMessage} onClose={() => setToastMessage("")} />
        )}
        {!session?.user && (
          <div className="text-center mb-6">
            <p className="mb-2">You are not logged in.</p>
            <a href="/login" className="text-blue-600 underline">Go to login</a>
          </div>
        )}
        <PageContainer>
          <h1 className="text-xl md:text-2xl font-bold mb-3 md:mb-4">All Packs</h1>
          <PackExplorer packs={packsData} />
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
