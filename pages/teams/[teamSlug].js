import React from 'react';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useModal } from '../../contexts/ModalContext';
import Head from 'next/head';
import { query } from '../../lib/db/postgres';
import PackFeedScaffold from '../../components/PackFeedScaffold';
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

  // Show all packs for the team; simple sorting by close time then created
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

  const sortedTeamPacks = packsData.slice().sort((a, b) => {
    const closeDiff = getCloseMs(a) - getCloseMs(b);
    if (closeDiff !== 0) return closeDiff;
    return getCreatedMs(b) - getCreatedMs(a);
  });

  return { props: { team, packsData: sortedTeamPacks } };
}

export default function TeamPage({ team, packsData }) {
  const { openModal } = useModal();
  const router = useRouter();
  const [selectedDay, setSelectedDay] = useState('today');
  const [selectedDate, setSelectedDate] = useState(null);

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

  // Sync selected day/date with URL query params on team page
  useEffect(() => {
    const { day, date } = router.query;
    const validDays = new Set(['today','yesterday','tomorrow','thisWeek','nextWeek','later']);
    if (typeof day === 'string' && validDays.has(day)) {
      setSelectedDay(day);
    }
    const parseDateParam = (val) => {
      if (!val || typeof val !== 'string') return null;
      const s = val.trim();
      let yyyy, mm, dd;
      if (/^\d{6}$/.test(s)) { // YYMMDD
        const yy = parseInt(s.slice(0, 2), 10);
        yyyy = 2000 + yy;
        mm = parseInt(s.slice(2, 4), 10);
        dd = parseInt(s.slice(4, 6), 10);
      } else if (/^\d{8}$/.test(s)) { // YYYYMMDD
        yyyy = parseInt(s.slice(0, 4), 10);
        mm = parseInt(s.slice(4, 6), 10);
        dd = parseInt(s.slice(6, 8), 10);
      } else if (/^\d{4}-\d{2}-\d{2}$/.test(s)) { // YYYY-MM-DD
        return s;
      } else {
        return null;
      }
      if (!yyyy || !mm || !dd) return null;
      const d = new Date(Date.UTC(yyyy, mm - 1, dd));
      if (Number.isNaN(d.getTime())) return null;
      return d.toISOString().slice(0, 10);
    };
    const iso = parseDateParam(typeof date === 'string' ? date : '');
    if (iso) setSelectedDate(iso); else setSelectedDate(null);
  }, [router.query.day, router.query.date]);

  // Update URL when day changes (clear explicit date)
  useEffect(() => {
    if (!router.isReady) return;
    const currentDay = (router.query.day || '').toString();
    if (currentDay !== selectedDay || router.query.date) {
      const nextQuery = { ...router.query, day: selectedDay };
      delete nextQuery.date;
      router.push({ pathname: router.pathname, query: nextQuery }, undefined, { shallow: true });
    }
  }, [selectedDay]);

  return (
    <div className="bg-white text-gray-900">
      <Head>
        <title>{team.teamNameFull || team.teamName} | Make the Take</title>
      </Head>
      <div className="p-4 w-full">
        <PackFeedScaffold
          packs={packsData}
          accent="green"
          title={team.teamNameFull || team.teamName}
          subtitle="Team feed"
          headerLeft={team.teamLogoURL ? (
            <img src={team.teamLogoURL} alt={team.teamNameFull || team.teamName} className="w-12 h-12 rounded" />
          ) : null}
          forceTeamSlugFilter={team.teamSlug}
          hideLeagueChips={true}
          initialDay='today'
        />
        <div className="mt-8">
          <MarketplacePreview limit={1} title="Marketplace" variant="sidebar" preferFeatured={true} />
        </div>
      </div>
    </div>
  );
}