import React from 'react';
import { useEffect } from 'react';
import { useModal } from '../../contexts/ModalContext';
import Head from 'next/head';
import { query } from '../../lib/db/postgres';
import PageContainer from '../../components/PageContainer';
import PackExplorer from '../../components/PackExplorer';
import LeaderboardTable from '../../components/LeaderboardTable';
import MarketplacePreview from '../../components/MarketplacePreview';

export async function getServerSideProps({ params }) {
  const { teamSlug } = params;

  // Lookup team by slug
  const { rows: teamRows } = await query(
    `SELECT id, team_id, team_slug, name, league, logo_url
       FROM teams
      WHERE LOWER(team_slug) = LOWER($1)
      LIMIT 1`,
    [teamSlug]
  );
  if (!teamRows.length) return { notFound: true };
  const team = {
    id: teamRows[0].id,
    teamID: teamRows[0].team_id || teamRows[0].id,
    teamSlug: teamRows[0].team_slug || teamSlug,
    teamName: teamRows[0].name || '',
    teamNameFull: teamRows[0].name || '',
    teamLeague: teamRows[0].league || '',
    teamLogoURL: teamRows[0].logo_url || null,
  };

  // Fetch packs joined to events; include team slugs so client filter works
  const { rows } = await query(
    `WITH sp AS (
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
              e.title AS event_title,
              ht.team_slug AS home_team_slug,
              at.team_slug AS away_team_slug,
              ht.name AS home_team_name,
              at.name AS away_team_name
         FROM packs p
    LEFT JOIN events e ON e.id = p.event_id
    LEFT JOIN teams ht ON e.home_team_id = ht.id
    LEFT JOIN teams at ON e.away_team_id = at.id
        WHERE (
          (LOWER(ht.team_slug) = LOWER($1) AND LOWER(COALESCE(ht.league, '')) = LOWER($2))
          OR (LOWER(at.team_slug) = LOWER($1) AND LOWER(COALESCE(at.league, '')) = LOWER($2))
        )
        ORDER BY p.created_at DESC NULLS LAST
        LIMIT 120
     )
     SELECT sp.*,
            COALESCE(pa.props_count, 0) AS props_count
       FROM sp
  LEFT JOIN (
         SELECT p.pack_id, COUNT(*)::int AS props_count
           FROM props p
       GROUP BY p.pack_id
       ) pa ON pa.pack_id = sp.id`,
    [teamSlug, team.teamLeague]
  );

  const toIso = (t) => (t ? new Date(t).toISOString() : null);
  const packsData = rows.map((r) => ({
    airtableId: r.id,
    eventId: r.event_id || null,
    eventTitle: r.event_title || null,
    propEventRollup: [],
    packID: r.pack_id || r.id,
    packTitle: r.title || 'Untitled Pack',
    packURL: r.pack_url || '',
    packCover: r.cover_url || null,
    packPrize: r.prize || '',
    prizeSummary: '',
    packSummary: r.summary || '',
    packType: '',
    packLeague: r.league || null,
    packStatus: r.pack_status || '',
    packOpenTime: toIso(r.pack_open_time) || null,
    packCloseTime: r.pack_close_time || null,
    eventTime: toIso(r.event_time) || null,
    firstPlace: '',
    createdAt: toIso(r.created_at) || null,
    propsCount: Number(r.props_count || 0),
    winnerProfileID: null,
    packWinnerRecordIds: [],
    takeCount: 0,
    userTakesCount: 0,
    homeTeamSlug: r.home_team_slug || null,
    awayTeamSlug: r.away_team_slug || null,
    homeTeamName: r.home_team_name || null,
    awayTeamName: r.away_team_name || null,
  }));

  // Apply same visibility and sorting rules as homepage feed
  const filteredPacks = packsData.filter((p) => {
    const sRaw = String(p?.packStatus || '').toLowerCase();
    const s = sRaw.replace(/\s+/g, '-');
    return (
      s === 'active' ||
      s === 'open' ||
      s === 'live' ||
      s === 'coming-soon' ||
      s === 'coming-up' ||
      s === 'closed' ||
      s === ''
    );
  });

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

  const sortedTeamPacks = filteredPacks.slice().sort((a, b) => {
    const sr = statusRank(a) - statusRank(b);
    if (sr !== 0) return sr;
    return getCloseMs(a) - getCloseMs(b);
  });

  // Build team leaderboard aggregated from takes linked to this team's packs/events/props
  const { rows: lbRows } = await query(
    `WITH filtered_takes AS (
       SELECT t.take_mobile,
              t.take_result,
              COALESCE(t.take_pts, 0) AS take_pts
         FROM takes t
         JOIN props pr ON pr.id = t.prop_id
         LEFT JOIN packs pk ON pk.id = COALESCE(t.pack_id, pr.pack_id)
         LEFT JOIN events ev_pk ON ev_pk.id = pk.event_id
         LEFT JOIN events ev_pr ON ev_pr.id = pr.event_id
        WHERE t.take_status = 'latest'
          AND EXISTS (
            SELECT 1 FROM props_teams pt
             WHERE pt.prop_id = pr.id AND pt.team_id = $1
          )
     ),
     agg AS (
       SELECT take_mobile,
              COUNT(*)::int AS takes,
              SUM(CASE WHEN take_result = 'won'  THEN 1 ELSE 0 END)::int AS won,
              SUM(CASE WHEN take_result = 'lost' THEN 1 ELSE 0 END)::int AS lost,
              SUM(CASE WHEN take_result = 'push' THEN 1 ELSE 0 END)::int AS pushed,
              SUM(take_pts)::int AS points
         FROM filtered_takes
        GROUP BY take_mobile
     )
     SELECT a.take_mobile,
            a.takes,
            a.won,
            a.lost,
            a.pushed,
            a.points,
            pr.profile_id
       FROM agg a
       LEFT JOIN profiles pr ON pr.mobile_e164 = a.take_mobile
      ORDER BY a.points DESC, a.takes DESC
      LIMIT 200`,
    [team.id]
  );

  const leaderboard = lbRows.map((r) => ({
    phone: r.take_mobile,
    takes: Number(r.takes || 0),
    points: Number(r.points || 0),
    won: Number(r.won || 0),
    lost: Number(r.lost || 0),
    pushed: Number(r.pushed || 0),
    profileID: r.profile_id || null,
  }));

  return { props: { team, packsData: sortedTeamPacks, leaderboard } };
}

export default function TeamPage({ team, packsData, leaderboard }) {
  const { openModal } = useModal();

  // Show Pack Active modal if a team-related pack is open/active
  useEffect(() => {
    if (!Array.isArray(packsData) || packsData.length === 0) return;
    try {
      const normalize = (s) => String(s || '').toLowerCase().replace(/\s+/g, '-');
      const isOpenish = (p) => {
        const s = normalize(p?.packStatus);
        return s === 'active' || s === 'open';
      };
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
        <title>{team.teamNameFull || team.teamName} | Make the Take</title>
      </Head>
      <div className="p-4 w-full">
        <PageContainer>
          <div className="mb-4 flex items-center gap-3">
            {team.teamLogoURL && (
              <img src={team.teamLogoURL} alt={team.teamNameFull || team.teamName} className="w-12 h-12 rounded" />
            )}
            <div>
              <h1 className="text-2xl font-bold">{team.teamNameFull || team.teamName}</h1>
              <p className="text-gray-600 text-sm">Team feed</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <section className="lg:col-span-2">
              <h2 className="text-xl md:text-2xl font-bold mb-3 md:mb-4">Packs</h2>
              <PackExplorer packs={packsData} accent="green" hideLeagueChips={true} forceTeamSlugFilter={team.teamSlug} />
            </section>

            <aside className="lg:col-span-1 lg:sticky lg:top-4 self-start">
              <h2 className="text-xl md:text-2xl font-bold mb-3 md:mb-4">Team Leaderboard</h2>
              <LeaderboardTable leaderboard={(leaderboard || []).slice(0, 10)} />
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