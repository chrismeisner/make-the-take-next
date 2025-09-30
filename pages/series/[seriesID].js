import React, { useEffect } from 'react';
import Head from 'next/head';
import { query } from '../../lib/db/postgres';
import PackFeedScaffold from '../../components/PackFeedScaffold';
import MarketplacePreview from '../../components/MarketplacePreview';
import { useModal } from '../../contexts/ModalContext';

export async function getServerSideProps({ params }) {
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

  // Fetch packs in the series (mirrors team page pack shape)
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
              e.title AS event_title
         FROM series s
         JOIN series_packs spx ON spx.series_id = s.id
         JOIN packs p ON p.id = spx.pack_id
    LEFT JOIN events e ON e.id = p.event_id
        WHERE s.id = $1
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
    [series.id]
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
          sidebarBelow={<MarketplacePreview limit={1} title="Marketplace" variant="sidebar" preferFeatured={true} />}
        />
      </div>
    </div>
  );
}


