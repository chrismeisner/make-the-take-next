import Head from "next/head";
import PageContainer from "../../../components/PageContainer";
import Breadcrumbs from "../../../components/Breadcrumbs";
import PackExplorer from "../../../components/PackExplorer";
import { getToken } from "next-auth/jwt";
import { query } from "../../../lib/db/postgres";

export default function LeaguePacksPage({ league = "", packsData = [] }) {
  const leagueUc = String(league || "").toUpperCase();
  return (
    <div className="bg-white text-gray-900">
      <Head>
        <title>{leagueUc} Packs | Make the Take</title>
      </Head>
      <PageContainer>
        <Breadcrumbs
          items={[
            { name: "Home", href: "/" },
            { name: "Packs", href: "/packs" },
            { name: `${leagueUc}` },
          ]}
        />
        <h1 className="text-xl md:text-2xl font-bold mb-3 md:mb-4">{leagueUc} Packs</h1>
        <PackExplorer packs={packsData} accent="blue" hideLeagueChips={true} forceLeagueFilter={String(league || "").toLowerCase()} />
      </PageContainer>
    </div>
  );
}

export async function getServerSideProps(context) {
  const { league } = context.params || {};
  const leagueLc = String(league || "").toLowerCase();
  if (!leagueLc) return { notFound: true };

  try {
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
          WHERE (p.pack_status IN ('active','graded','coming-soon','draft') OR p.pack_status IS NULL)
            AND LOWER(COALESCE(p.league, '')) = $2
          ORDER BY p.created_at DESC NULLS LAST
          LIMIT 200
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
      [userPhone, leagueLc]
    );

    const toIso = (t) => (t ? new Date(t).toISOString() : null);
    const packsData = rows.map((r) => ({
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

    // Sort to prefer open/active then by closest closing
    const statusRank = (p) => {
      const s = String(p?.packStatus || '').toLowerCase().replace(/\s+/g, '-');
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
      try { return Number.isFinite(new Date(val).getTime()) ? new Date(val).getTime() : NaN; } catch { return NaN; }
    };
    const getCloseMs = (p) => {
      const ms = parseToMs(p?.packCloseTime);
      return Number.isFinite(ms) ? ms : Number.POSITIVE_INFINITY;
    };
    const sorted = packsData.slice().sort((a, b) => {
      const sr = statusRank(a) - statusRank(b);
      if (sr !== 0) return sr;
      return getCloseMs(a) - getCloseMs(b);
    });

    return { props: { league: leagueLc, packsData: sorted } };
  } catch (error) {
    console.error("[LeaguePacksPage] Error fetching packs:", error);
    return { notFound: true };
  }
}
