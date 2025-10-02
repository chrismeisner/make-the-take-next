import React, { useEffect } from 'react';
import Head from 'next/head';
import { query } from '../../lib/db/postgres';
import PackFeedScaffold from '../../components/PackFeedScaffold';
import MarketplacePreview from '../../components/MarketplacePreview';
import { useModal } from '../../contexts/ModalContext';
import { getToken } from 'next-auth/jwt';

export async function getServerSideProps({ params, req }) {
  const { seriesID } = params;

  // Resolve series by series_id (stable text) or UUID
  const { rows: sRows } = await query(
    `SELECT id, series_id, title, summary, cover_url, status
       FROM series
      WHERE series_id = $1 OR id::text = $1
      LIMIT 1`,
    [seriesID]
  );
  if (!sRows.length) return { notFound: true };
  const series = {
    id: sRows[0].id,
    seriesID: sRows[0].series_id || sRows[0].id,
    title: sRows[0].title || 'Untitled Series',
    summary: sRows[0].summary || '',
    coverUrl: sRows[0].cover_url || null,
    status: sRows[0].status || null,
  };

  // Identify current user for SSR user progress counts
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  const userPhone = token?.phone || null;

  // Fetch packs in the series with enriched fields to match homepage/team feeds
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
              p.creator_profile_id
         FROM series s
         JOIN series_packs spx ON spx.series_id = s.id
         JOIN packs p ON p.id = spx.pack_id
    LEFT JOIN events e ON e.id = p.event_id
        WHERE s.id = $1
        ORDER BY p.created_at DESC NULLS LAST
        LIMIT 120
     ),
     series_for_pack AS (
       SELECT sp.id AS pack_id,
              json_agg(DISTINCT jsonb_build_object(
                'id', s.id,
                'seriesId', s.series_id,
                'title', s.title
              )) FILTER (WHERE s.id IS NOT NULL) AS series
         FROM sp
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
         FROM sp
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
         FROM sp
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
     props_agg AS (
       SELECT p.pack_id,
              COUNT(*)::int AS props_count,
              MIN(p.open_time) AS open_time,
              MAX(p.close_time) AS close_time
         FROM props p
         JOIN sp ON sp.id = p.pack_id
        GROUP BY p.pack_id
     ),
     takes_agg AS (
       SELECT t.pack_id,
              COUNT(*) FILTER (WHERE t.take_status = 'latest')::int AS total_count,
              COUNT(*) FILTER (WHERE t.take_status = 'latest' AND t.take_mobile = $2)::int AS user_count
         FROM takes t
         JOIN sp ON sp.id = t.pack_id
        GROUP BY t.pack_id
     ),
     latest_takes AS (
       SELECT t.*
         FROM takes t
         JOIN sp ON sp.id = t.pack_id
        WHERE t.take_status = 'latest'
     ),
     take_points AS (
       SELECT lt.pack_id,
              lt.take_mobile,
              SUM(COALESCE(lt.take_pts, 0))::int AS points
         FROM latest_takes lt
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
       FROM sp
  LEFT JOIN props_agg pa ON pa.pack_id = sp.id
  LEFT JOIN takes_agg ta ON ta.pack_id = sp.id
  LEFT JOIN top_taker tt ON tt.pack_id = sp.id AND tt.rn = 1
  LEFT JOIN profiles prf ON prf.mobile_e164 = tt.take_mobile
  LEFT JOIN take_points tp ON tp.pack_id = tt.pack_id AND tp.take_mobile = tt.take_mobile
  LEFT JOIN events_for_pack efp ON efp.pack_id = sp.id
  LEFT JOIN teams_for_pack tfp ON tfp.pack_id = sp.id
  LEFT JOIN series_for_pack sfp ON sfp.pack_id = sp.id
  LEFT JOIN profiles pr ON pr.id = sp.creator_profile_id`,
    [series.id, userPhone]
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
    packCloseTime: toIso(r.pack_close_time) || null,
    eventTime: toIso(r.event_time) || null,
    firstPlace: '',
    createdAt: toIso(r.created_at) || null,
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
          eventTime: e.eventTime || null,
        })) : [],
    linkedTeams: Array.isArray(r.linked_teams)
      ? r.linked_teams.map((t) => ({ slug: t.slug || null, name: t.name || null, logoUrl: t.logoUrl || null }))
          .filter((t) => t.slug)
      : [],
    creatorProfileId: r.creator_profile_id || null,
    creatorProfileHandle: r.creator_profile_handle || null,
    seriesList: Array.isArray(r.series)
      ? r.series.map((s) => ({ id: s.id || null, series_id: s.seriesId || null, title: s.title || null }))
      : [],
  }));

  // Sort similar to team page
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

  const getCreatedMs = (p) => {
    const ms = parseToMs(p?.createdAt);
    return Number.isFinite(ms) ? ms : Number.NEGATIVE_INFINITY;
  };

  const sortedPacks = packsData.slice().sort((a, b) => {
    const closeDiff = getCloseMs(a) - getCloseMs(b);
    if (closeDiff !== 0) return closeDiff;
    return getCreatedMs(b) - getCreatedMs(a);
  });

  return { props: { series, packsData: sortedPacks } };
}

export default function SeriesPage({ series, packsData }) {
  const { openModal } = useModal();

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
        <title>{series.title} | Make the Take</title>
      </Head>
      <div className="p-4 w-full">
        <PackFeedScaffold
          packs={packsData}
          accent="blue"
          title={series.title}
          subtitle={series.summary || 'Series feed'}
          headerLeft={series.coverUrl ? (
            <img src={series.coverUrl} alt={series.title} className="w-12 h-12 rounded" />
          ) : null}
          hideLeagueChips={true}
          initialDay='today'
          leaderboardVariant="allTime"
          sidebarBelow={<MarketplacePreview limit={1} title="Marketplace" variant="sidebar" preferFeatured={true} />}
        />
      </div>
    </div>
  );
}


