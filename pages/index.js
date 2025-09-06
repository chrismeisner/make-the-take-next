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
import { getDataBackend } from "../lib/runtimeConfig";

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
  // Force http for internal SSR fetch to avoid TLS handshake issues
  const proto = "http";
  const host =
    context.req.headers["x-forwarded-host"] || context.req.headers.host;
  const origin = process.env.SITE_URL || `${proto}://${host}`;
  const backend = getDataBackend();
  console.log('[HomePage GSSP] start load =>', { backend, origin });

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
    // Align filter with Airtable: include active, graded, coming-soon
    const allPacks = Array.isArray(data.packs) ? data.packs : [];
    try {
      const statusEmoji = (s) => {
        const v = String(s || '').toLowerCase().replace(/\s+/g, '-');
        if (v === 'open' || v === 'active') return '🟢 open';
        if (v === 'coming-soon' || v === 'coming-up') return '🟠 coming-soon';
        if (v === 'closed') return '🔴 closed';
        if (v === 'completed') return '⚫ completed';
        if (v === 'graded') return '🔵 graded';
        return '⚪ unknown';
      };
      const fmtTime = (t) => (t ? new Date(t).toISOString() : '—');
      const yesNo = (v) => (v ? '✅' : '❌');
      console.log('\n=== PACKS.fetch (first 15) ===');
      allPacks.slice(0, 15).forEach((p, i) => {
        const id = p.packID || p.id || p.airtableId;
        const coverUrl = Array.isArray(p?.packCover) && p.packCover.length > 0
          ? p.packCover[0]?.url
          : (typeof p?.packCover === 'string' ? p.packCover : null);
        console.log(`\n#${String(i + 1).padStart(2, '0')} ${p.packURL ? `(${p.packURL})` : ''}`);
        console.log(`  🆔 id: ${id}`);
        console.log(`  📛 title: ${p.packTitle || 'Untitled'}`);
        console.log(`  🏷️ league: ${p.packLeague || '—'}`);
        console.log(`  📊 status: ${statusEmoji(p.packStatus)}`);
        console.log(`  🧩 props: ${p.propsCount ?? 0}`);
        console.log(`  👥 takes: ${p.takeCount ?? 0} total, ${p.userTakesCount ?? 0} you`);
        console.log(`  🕒 window: ${fmtTime(p.packOpenTime)} → ${fmtTime(p.packCloseTime)}`);
        console.log(`  🖼️ cover: ${yesNo(!!coverUrl)}`);
      });
    } catch (e) {
      console.warn('[HomePage GSSP] summarize packs failed =>', e?.message || e);
    }
    const filteredPacks = allPacks.filter((p) => {
      const sRaw = String(p?.packStatus || '').toLowerCase();
      const s = sRaw.replace(/\s+/g, '-');
      // Default-hide graded packs on homepage
      return (
        s === 'active' ||
        s === 'open' ||
        s === 'coming-soon' ||
        s === 'coming-up' ||
        s === ''
      );
    });
    console.log('[HomePage GSSP] filtered packs count =', filteredPacks.length);
    // Sort: open/active first, then by packCloseTime ascending (soonest closing first).
    // Packs without close time go last within their status grouping.
    const statusRank = (p) => {
      const sRaw = String(p?.packStatus || '').toLowerCase();
      // Normalize minor variants to Airtable's canonical value
      const s = sRaw.replace(/\s+/g, '-'); // "coming up" -> "coming-up"
      if (s === 'open' || s === 'active') return 0;
      if (s === 'coming-soon' || s === 'coming-up') return 1;
      if (s === 'closed') return 2;
      if (s === 'completed') return 3;
      if (s === 'graded') return 4;
      return 5;
    };
    const parseToMs = (val) => {
      if (val == null) return NaN;
      if (typeof val === 'number') return Number.isFinite(val) ? val : NaN;
      if (typeof val === 'string') {
        const trimmed = val.trim();
        if (/^\d{11,}$/.test(trimmed)) {
          const n = Number(trimmed);
          return Number.isFinite(n) ? n : NaN;
        }
        const ms = new Date(trimmed).getTime();
        return Number.isFinite(ms) ? ms : NaN;
      }
      try {
        const ms = new Date(val).getTime();
        return Number.isFinite(ms) ? ms : NaN;
      } catch { return NaN; }
    };
    const getCloseMs = (p) => {
      const ms = parseToMs(p?.packCloseTime);
      return Number.isFinite(ms) ? ms : Number.POSITIVE_INFINITY;
    };
    const sorted = filteredPacks.slice().sort((a, b) => {
      const sr = statusRank(a) - statusRank(b);
      if (sr !== 0) return sr;
      return getCloseMs(a) - getCloseMs(b);
    });
    try {
      const statusEmoji = (s) => {
        const v = String(s || '').toLowerCase().replace(/\s+/g, '-');
        if (v === 'open' || v === 'active') return '🟢 open';
        if (v === 'coming-soon' || v === 'coming-up') return '🟠 coming-soon';
        if (v === 'closed') return '🔴 closed';
        if (v === 'completed') return '⚫ completed';
        if (v === 'graded') return '🔵 graded';
        return '⚪ unknown';
      };
      const fmtTime = (t) => (t ? new Date(t).toISOString() : '—');
      const yesNo = (v) => (v ? '✅' : '❌');
      console.log('\n=== PACKS.sorted (first 15) ===');
      sorted.slice(0, 15).forEach((p, i) => {
        const id = p.packID || p.id || p.airtableId;
        const coverUrl = Array.isArray(p?.packCover) && p.packCover.length > 0
          ? p.packCover[0]?.url
          : (typeof p?.packCover === 'string' ? p.packCover : null);
        console.log(`\n#${String(i + 1).padStart(2, '0')} ${p.packURL ? `(${p.packURL})` : ''}`);
        console.log(`  🆔 id: ${id}`);
        console.log(`  📛 title: ${p.packTitle || 'Untitled'}`);
        console.log(`  🏷️ league: ${p.packLeague || '—'}`);
        console.log(`  📊 status: ${statusEmoji(p.packStatus)}`);
        console.log(`  🧩 props: ${p.propsCount ?? 0}`);
        console.log(`  👥 takes: ${p.takeCount ?? 0} total, ${p.userTakesCount ?? 0} you`);
        console.log(`  🕒 window: ${fmtTime(p.packOpenTime)} → ${fmtTime(p.packCloseTime)}`);
        console.log(`  🖼️ cover: ${yesNo(!!coverUrl)}`);
      });
    } catch {}
    return { props: { packsData: sorted } };
  } catch (error) {
    console.error("[HomePage] Error fetching packs:", error);
    return { props: { packsData: [] } };
  }
}
