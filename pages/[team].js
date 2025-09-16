import React from 'react';
import Head from 'next/head';
import { query } from '../lib/db/postgres';
import PageContainer from '../components/PageContainer';
import PackExplorer from '../components/PackExplorer';
import LeaderboardTable from '../components/LeaderboardTable';
import MarketplacePreview from '../components/MarketplacePreview';

export async function getServerSideProps({ params }) {
  const { team } = params;

  // Resolve team by slug (root path segment)
  const { rows: teamRows } = await query(
    `SELECT id, team_id, team_slug, name, league, logo_url
       FROM teams
      WHERE LOWER(team_slug) = LOWER($1)
      LIMIT 1`,
    [team]
  );
  if (!teamRows.length) return { notFound: true };
  const teamData = {
    id: teamRows[0].id,
    teamID: teamRows[0].team_id || teamRows[0].id,
    teamSlug: teamRows[0].team_slug || team,
    teamName: teamRows[0].name || '',
    teamNameFull: teamRows[0].name || '',
    teamLeague: teamRows[0].league || '',
    teamLogoURL: teamRows[0].logo_url || null,
  };

  // Fetch packs associated with this team via event home/away relations
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
    [team, teamData.teamLeague]
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
          AND (
            (ev_pk.home_team_id = $1 OR ev_pk.away_team_id = $1)
            OR (ev_pr.home_team_id = $1 OR ev_pr.away_team_id = $1)
            OR EXISTS (
              SELECT 1 FROM props_teams pt
               WHERE pt.prop_id = pr.id AND pt.team_id = $1
            )
            OR EXISTS (
              SELECT 1
                FROM packs_events pe
                JOIN events e2 ON e2.id = pe.event_id
               WHERE pe.pack_id = pk.id AND (e2.home_team_id = $1 OR e2.away_team_id = $1)
            )
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
    [teamData.id]
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

  return { props: { team: teamData, packsData, leaderboard } };
}

export default function TeamRootPage({ team, packsData, leaderboard }) {
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
