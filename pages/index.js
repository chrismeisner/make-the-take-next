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
import { getToken } from "next-auth/jwt";
import { query } from "../lib/db/postgres";

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
    let allPacks = [];
    if (backend === 'postgres') {
      const token = await getToken({ req: context.req, secret: process.env.NEXTAUTH_SECRET });
      const userPhone = token?.phone || null;
      const { rows } = await query(
        `WITH selected_packs AS (
           SELECT p.id,
                  p.pack_id,
                  p.pack_url,
                  p.title,
                  p.summary,
                  p.prize,
                  p.cover_url,
                  p.league,
                  p.created_at,
                  p.pack_status,
                  p.pack_open_time,
                  p.pack_close_time,
                  p.event_id,
                  e.event_time,
                  e.title AS event_title
             FROM packs p
             LEFT JOIN events e ON e.id = p.event_id
            WHERE LOWER(COALESCE(p.pack_status, '')) IN ('active','graded','coming-soon','draft')
               OR p.pack_status IS NULL
            ORDER BY p.created_at DESC NULLS LAST
            LIMIT 80
         ),
         takes_agg AS (
           SELECT t.pack_id,
                  COUNT(*) FILTER (WHERE t.take_status = 'latest')::int AS total_count,
                  COUNT(*) FILTER (WHERE t.take_status = 'latest' AND t.take_mobile = $1)::int AS user_count
             FROM takes t
             JOIN selected_packs sp ON sp.id = t.pack_id
            GROUP BY t.pack_id
         ),
         props_agg AS (
           SELECT p.pack_id,
                  COUNT(*)::int AS props_count,
                  MIN(p.open_time) AS open_time,
                  MAX(p.close_time) AS close_time
             FROM props p
             JOIN selected_packs sp ON sp.id = p.pack_id
            GROUP BY p.pack_id
         )
         SELECT sp.id,
                sp.pack_id,
                sp.pack_url,
                sp.title,
                sp.summary,
                sp.prize,
                sp.cover_url,
                sp.league,
                sp.created_at,
                sp.pack_status,
                COALESCE(sp.pack_open_time::text, pa.open_time::text) AS pack_open_time,
                COALESCE(sp.pack_close_time::text, pa.close_time::text) AS pack_close_time,
                sp.event_id,
                sp.event_time::text AS event_time,
                sp.event_title,
                COALESCE(pa.props_count, 0) AS props_count,
                COALESCE(ta.total_count, 0) AS total_take_count,
                COALESCE(ta.user_count, 0) AS user_take_count
           FROM selected_packs sp
           LEFT JOIN props_agg pa ON pa.pack_id = sp.id
           LEFT JOIN takes_agg ta ON ta.pack_id = sp.id`,
        [userPhone]
      );
      const toIso = (t) => (t ? new Date(t).toISOString() : null);
      allPacks = rows.map((r) => ({
        airtableId: r.id,
        eventId: r.event_id || null,
        eventTitle: r.event_title || null,
        propEventRollup: [],
        packID: r.pack_id || r.id,
        packTitle: r.title || "Untitled Pack",
        packURL: r.pack_url || "",
        packCover: r.cover_url || null,
        packPrize: r.prize || "",
        prizeSummary: "",
        packSummary: r.summary || "",
        packType: "",
        packLeague: r.league || null,
        packStatus: r.pack_status || "",
        packOpenTime: toIso(r.pack_open_time) || null,
        packCloseTime: toIso(r.pack_close_time) || null,
        eventTime: toIso(r.event_time),
        firstPlace: "",
        createdAt: toIso(r.created_at) || null,
        propsCount: Number(r.props_count || 0),
        winnerProfileID: null,
        packWinnerRecordIds: [],
        takeCount: Number(r.total_take_count || 0),
        userTakesCount: Number(r.user_count || 0),
      }));
    } else {
      // Fallback to API fetch (Airtable mode)
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), Number.parseInt(process.env.SSR_FETCH_TIMEOUT_MS || '9000', 10));
      const res = await fetch(`${origin}/api/packs`, {
        headers: { cookie: context.req.headers.cookie || "" },
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Failed to load packs");
      allPacks = Array.isArray(data.packs) ? data.packs : [];
    }
    // Align filter with Airtable: include active, graded, coming-soon
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
