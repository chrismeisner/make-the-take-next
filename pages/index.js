// File: /pages/index.js
import { useState, useEffect } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import Toast from "../components/Toast";
import { useSession } from "next-auth/react";
import { useModal } from "../contexts/ModalContext";
import PackFeedScaffold from "../components/PackFeedScaffold";
import MarketplacePreview from "../components/MarketplacePreview";
import { getDataBackend } from "../lib/runtimeConfig";
import { getToken } from "next-auth/jwt";
import { query } from "../lib/db/postgres";

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
  // Home now delegates day/date state to PackFeedScaffold


  // Removed welcome modal entirely

  // Show Pack Active modal if any pack is currently open/active
  useEffect(() => {
    if (typeof window !== 'undefined' && window.__MTT_SUPPRESS_GLOBAL_MODALS__) return;
    if (!Array.isArray(packsData) || packsData.length === 0) return;
    try {
      const normalize = (s) => String(s || '').toLowerCase().replace(/\s+/g, '-');
      const isOpenish = (p) => {
        const s = normalize(p?.packStatus);
        return s === 'active' || s === 'open';
      };
      // Prefer 'active' over 'open'
      const activePack = packsData.find((p) => normalize(p?.packStatus) === 'active')
        || packsData.find((p) => normalize(p?.packStatus) === 'open');
      if (!activePack || !isOpenish(activePack)) return;

      const idKey = activePack.packURL || activePack.packID || activePack.airtableId || 'unknown';
      const seenKey = `packActiveShown:${idKey}`;
      if (typeof window !== 'undefined' && sessionStorage.getItem(seenKey)) return;

      const coverUrl = Array.isArray(activePack?.packCover) && activePack.packCover.length > 0
        ? (activePack.packCover[0]?.url || null)
        : (typeof activePack?.packCover === 'string' ? activePack.packCover : null);

      openModal('packActive', {
        packTitle: activePack.packTitle || '',
        packURL: activePack.packURL || '',
        coverUrl,
        packCloseTime: activePack.packCloseTime || null,
      });

      if (typeof window !== 'undefined') sessionStorage.setItem(seenKey, '1');
    } catch {}
  }, [packsData, openModal]);

  return (
    <div className="bg-white text-gray-900">
      <Head>
        <title>Packs | Make the Take</title>
      </Head>
      <div className="w-full">
        {toastMessage && (
          <Toast message={toastMessage} onClose={() => setToastMessage("")} />
        )}
        
        <PackFeedScaffold
          packs={packsData}
          accent="green"
          title={null}
          subtitle={null}
          headerLeft={null}
          forceTeamSlugFilter={(router.query.team || '').toString()}
          hideLeagueChips={true}
          initialDay='today'
          showLeaderboard={false}
          sidebarBelow={<MarketplacePreview limit={1} title="Marketplace" variant="sidebar" preferFeatured={true} showSeeAll={true} />}
        />
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
    // Promo redirect: honor ?packs=<key> or ?promo=<key>
    try {
      const candidates = ['packs','team','promo'];
      const foundParam = candidates.find((p) => context.query?.[p]);
      const promoKey = foundParam ? String(context.query[foundParam]).trim() : '';
      if (promoKey) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), Number.parseInt(process.env.SSR_FETCH_TIMEOUT_MS || '6000', 10));
        const qs = new URLSearchParams({ key: promoKey, param: foundParam }).toString();
        const res = await fetch(`${origin}/api/promo/resolve?${qs}`, { signal: controller.signal });
        clearTimeout(timeout);
        if (res.ok) {
          const data = await res.json();
          if (data?.success && data?.destination) {
            return {
              redirect: { destination: data.destination, permanent: false },
            };
          }
        }
      }
    } catch (e) {
      try { console.warn('[HomePage GSSP] promo resolve failed =>', e?.message || e); } catch {}
    }
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
                  p.creator_profile_id,
                  e.event_time,
                  e.title AS event_title
             FROM packs p
             LEFT JOIN events e ON e.id = p.event_id
          WHERE p.pack_status IN ('active','open','coming-soon','draft','live','closed','pending-grade','graded')
               OR p.pack_status IS NULL
            ORDER BY p.created_at DESC NULLS LAST
            LIMIT 80
         ),
         series_for_pack AS (
           SELECT sp.id AS pack_id,
                  json_agg(DISTINCT jsonb_build_object(
                    'id', s.id,
                    'seriesId', s.series_id,
                    'title', s.title
                  )) FILTER (WHERE s.id IS NOT NULL) AS series
             FROM selected_packs sp
             LEFT JOIN series_packs spx ON spx.pack_id = sp.id
             LEFT JOIN series s ON s.id = spx.series_id
            GROUP BY sp.id
         ),
         events_for_pack AS (
           SELECT sp.id AS pack_id,
                  json_agg(
                    json_build_object(
                      'id', e.id::text,
                      'espnGameID', e.espn_game_id,
                      'league', e.league,
                      'title', e.title,
                      'eventTime', COALESCE(e.event_time::text, NULL)
                    )
                    ORDER BY e.event_time ASC NULLS LAST
                  ) AS events
             FROM selected_packs sp
             LEFT JOIN (
               SELECT DISTINCT pe.pack_id, e.id, e.espn_game_id, e.league, e.title, e.event_time
                 FROM packs_events pe
                 JOIN events e ON e.id = pe.event_id
               UNION
               SELECT DISTINCT p.id AS pack_id, e.id, e.espn_game_id, e.league, e.title, e.event_time
                 FROM packs p
                 JOIN events e ON e.id = p.event_id
             ) ev ON ev.pack_id = sp.id
             LEFT JOIN events e ON e.id = ev.id
            GROUP BY sp.id
         ),
        teams_for_pack AS (
          SELECT sp.id AS pack_id,
                 json_agg(DISTINCT jsonb_build_object(
                   'slug', t.team_slug,
                   'name', t.name,
                   'logoUrl', t.logo_url
                 )) FILTER (WHERE t.team_slug IS NOT NULL) AS teams
            FROM selected_packs sp
            LEFT JOIN (
              SELECT p.id AS pack_id, e.home_team_id AS team_id
                FROM packs p
                JOIN events e ON e.id = p.event_id
              UNION ALL
              SELECT p.id AS pack_id, e.away_team_id AS team_id
                FROM packs p
                JOIN events e ON e.id = p.event_id
              UNION ALL
              SELECT pe.pack_id AS pack_id, e.home_team_id AS team_id
                FROM packs_events pe
                JOIN events e ON e.id = pe.event_id
              UNION ALL
              SELECT pe.pack_id AS pack_id, e.away_team_id AS team_id
                FROM packs_events pe
                JOIN events e ON e.id = pe.event_id
              UNION ALL
              SELECT pr.pack_id AS pack_id, pt.team_id
                FROM props pr
                JOIN props_teams pt ON pt.prop_id = pr.id
            ) links ON links.pack_id = sp.id
            LEFT JOIN teams t ON t.id = links.team_id
           GROUP BY sp.id
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
         ),
         latest_takes AS (
           SELECT t.*
             FROM takes t
             JOIN selected_packs sp ON sp.id = t.pack_id
            WHERE t.take_status = 'latest'
         ),
         take_points AS (
           SELECT lt.pack_id,
                  lt.take_mobile,
                  SUM(
                    CASE
                      WHEN pr.prop_status IN ('gradedA','gradedB') THEN
                        CASE
                          WHEN pr.prop_status = 'gradedA' AND lt.prop_side = 'A' THEN COALESCE(pr.prop_side_a_value, 1)
                          WHEN pr.prop_status = 'gradedB' AND lt.prop_side = 'B' THEN COALESCE(pr.prop_side_b_value, 1)
                          ELSE 0
                        END
                      WHEN pr.prop_status = 'push' THEN 100
                      ELSE 0
                    END
                  )::int AS points
             FROM latest_takes lt
             JOIN props pr ON pr.id = lt.prop_id
            GROUP BY lt.pack_id, lt.take_mobile
         ),
         top_taker AS (
           SELECT tp.pack_id,
                  tp.take_mobile,
                  tp.points,
                  ROW_NUMBER() OVER (PARTITION BY tp.pack_id ORDER BY tp.points DESC NULLS LAST) AS rn
             FROM take_points tp
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
                sp.creator_profile_id,
                pr.profile_id AS creator_profile_handle,
                efp.events AS events,
                tfp.teams AS linked_teams,
                sfp.series AS series,
                COALESCE(pa.props_count, 0) AS props_count,
                COALESCE(ta.total_count, 0) AS total_take_count,
                COALESCE(ta.user_count, 0) AS user_count,
                CASE WHEN LOWER(COALESCE(sp.pack_status,'')) = 'graded' THEN tp.points ELSE NULL END AS winner_points,
                CASE WHEN LOWER(COALESCE(sp.pack_status,'')) = 'graded' THEN prf.profile_id ELSE NULL END AS winner_profile_id
           FROM selected_packs sp
           LEFT JOIN props_agg pa ON pa.pack_id = sp.id
           LEFT JOIN takes_agg ta ON ta.pack_id = sp.id
           LEFT JOIN top_taker tt ON tt.pack_id = sp.id AND tt.rn = 1
           LEFT JOIN profiles prf ON prf.mobile_e164 = tt.take_mobile
           LEFT JOIN take_points tp ON tp.pack_id = tt.pack_id AND tp.take_mobile = tt.take_mobile
           LEFT JOIN events_for_pack efp ON efp.pack_id = sp.id
           LEFT JOIN teams_for_pack tfp ON tfp.pack_id = sp.id
           LEFT JOIN series_for_pack sfp ON sfp.pack_id = sp.id
           LEFT JOIN profiles pr ON pr.id = sp.creator_profile_id`,
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
        creatorProfileId: r.creator_profile_id || null,
        creatorProfileHandle: r.creator_profile_handle || null,
        propsCount: Number(r.props_count || 0),
        winnerProfileID: r.winner_profile_id || null,
        winnerPoints: (r.winner_points == null ? null : Number(r.winner_points)),
        packWinnerRecordIds: [],
        takeCount: Number(r.total_take_count || 0),
        userTakesCount: Number(r.user_count || 0),
        events: Array.isArray(r.events)
          ? r.events.map((e) => ({
              id: e.id || null,
              espnGameID: e.espnGameID || null,
              league: e.league || null,
              title: e.title || null,
              eventTime: toIso(e.eventTime) || null,
            }))
          : [],
        linkedTeams: Array.isArray(r.linked_teams)
          ? r.linked_teams.map((t) => ({
              slug: t.slug || null,
              name: t.name || null,
              logoUrl: t.logoUrl || null,
            })).filter((t) => t.slug)
          : [],
        seriesList: Array.isArray(r.series)
          ? r.series.map((s) => ({ id: s.id || null, series_id: s.seriesId || null, title: s.title || null }))
          : [],
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
    // Include active, live, coming soon, closed on homepage (hide graded)
    try {
      const statusEmoji = (s) => {
        const v = String(s || '').toLowerCase().replace(/\s+/g, '-');
        if (v === 'open' || v === 'active') return '🟢 open';
        if (v === 'coming-soon' || v === 'coming-up') return '🟠 coming-soon';
        if (v === 'closed') return '🔴 closed';
        if (v === 'live') return '🟣 live';
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
        try {
          const toPathLeague = (lg) => {
            const v = String(lg || '').toLowerCase();
            switch (v) {
              case 'mlb': return 'baseball/mlb';
              case 'nba': return 'basketball/nba';
              case 'nfl': return 'football/nfl';
              case 'nhl': return 'hockey/nhl';
              case 'ncaam': return 'basketball/mens-college-basketball';
              case 'ncaaw': return 'basketball/womens-college-basketball';
              case 'ncaaf': return 'football/college-football';
              default: return `baseball/${v}`;
            }
          };
          const events = Array.isArray(p?.events) ? p.events : [];
          if (events.length > 0) {
            console.log('  🎯 events:');
            events.forEach((ev) => {
              const espnId = ev?.espnGameID || ev?.espn || ev?.id || '';
              const league = ev?.league || p?.packLeague || '';
              if (!espnId || !league) {
                console.log('    - (missing league or espn id)');
                return;
              }
              const pathLeague = toPathLeague(league);
              const localUrl = `/api/scores?league=${league}&event=${espnId}`;
              const espnSummary = `https://site.api.espn.com/apis/site/v2/sports/${pathLeague}/summary?event=${espnId}`;
              console.log(`    - getting the espn id: ${espnId} (${league})`);
              console.log(`      ↳ local: ${localUrl}`);
              console.log(`      ↳ espn:  ${espnSummary}`);
            });
          }
        } catch {}
      });
    } catch (e) {
      console.warn('[HomePage GSSP] summarize packs failed =>', e?.message || e);
    }
    const filteredPacks = allPacks.filter((p) => {
      const sRaw = String(p?.packStatus || '').toLowerCase();
      const s = sRaw.replace(/\s+/g, '-');
      return (
        s === 'active' ||
        s === 'open' ||
        s === 'live' ||
        s === 'coming-soon' ||
        s === 'coming-up' ||
        s === 'closed' ||
        s === 'pending-grade' ||
        s === 'graded' ||
        s === ''
      );
    });
    console.log('[HomePage GSSP] filtered packs count =', filteredPacks.length);
    // Sort: open/active first, then coming soon, then closed, completed, graded (last).
    const statusRank = (p) => {
      const sRaw = String(p?.packStatus || '').toLowerCase();
      const s = sRaw.replace(/\s+/g, '-');
      if (s === 'open' || s === 'active') return 0;
      if (s === 'coming-soon' || s === 'coming-up') return 1;
      if (s === 'closed' || s === 'live') return 2;
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
        try {
          const toPathLeague = (lg) => {
            const v = String(lg || '').toLowerCase();
            switch (v) {
              case 'mlb': return 'baseball/mlb';
              case 'nba': return 'basketball/nba';
              case 'nfl': return 'football/nfl';
              case 'nhl': return 'hockey/nhl';
              case 'ncaam': return 'basketball/mens-college-basketball';
              case 'ncaaw': return 'basketball/womens-college-basketball';
              case 'ncaaf': return 'football/college-football';
              default: return `baseball/${v}`;
            }
          };
          const events = Array.isArray(p?.events) ? p.events : [];
          if (events.length > 0) {
            console.log('  🎯 events:');
            events.forEach((ev) => {
              const espnId = ev?.espnGameID || ev?.espn || ev?.id || '';
              const league = ev?.league || p?.packLeague || '';
              if (!espnId || !league) {
                console.log('    - (missing league or espn id)');
                return;
              }
              const pathLeague = toPathLeague(league);
              const localUrl = `/api/scores?league=${league}&event=${espnId}`;
              const espnSummary = `https://site.api.espn.com/apis/site/v2/sports/${pathLeague}/summary?event=${espnId}`;
              console.log(`    - getting the espn id: ${espnId} (${league})`);
              console.log(`      ↳ local: ${localUrl}`);
              console.log(`      ↳ espn:  ${espnSummary}`);
            });
          }
        } catch {}
      });
    } catch {}
    return { props: { packsData: sorted } };
  } catch (error) {
    console.error("[HomePage] Error fetching packs:", error);
    return { props: { packsData: [] } };
  }
}
