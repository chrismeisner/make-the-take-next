import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import DaySelector from './DaySelector';
import DayBasedPackFeed from './DayBasedPackFeed';
import DayBasedLeaderboard from './DayBasedLeaderboard';
import PageContainer from './PageContainer';

export default function PackFeedScaffold({
  packs,
  accent = 'green',
  title = null,
  subtitle = null,
  headerLeft = null,
  forceTeamSlugFilter = '',
  hideLeagueChips = true,
  initialDay = 'today',
  sidebarBelow = null,
}) {
  const router = useRouter();
  const [selectedDay, setSelectedDay] = useState(initialDay);
  const [selectedDate, setSelectedDate] = useState(null);

  // Sync selected day/date with URL query params
  useEffect(() => {
    if (!router.isReady) return;
    
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
  }, [router.query.day, router.query.date, router.isReady]);

  // Update URL when day changes (clear explicit date) or when no day parameter is present
  useEffect(() => {
    if (!router.isReady) return;
    if (typeof window !== 'undefined' && window.__MTT_SUPPRESS_URL_SYNC__) return;
    const currentDay = (router.query.day || '').toString();
    
    // If no day parameter is present, or if day changed, or if there's a date parameter, update URL
    if (!currentDay || currentDay !== selectedDay || router.query.date) {
      const nextQuery = { ...router.query, day: selectedDay };
      delete nextQuery.date;
      router.push({ pathname: router.pathname, query: nextQuery }, undefined, { shallow: true });
    }
  }, [selectedDay, router.isReady, router.pathname, router.query]);

  return (
    <div className="w-full">
      <DaySelector
        selectedDay={selectedDay}
        onDayChange={setSelectedDay}
        packs={packs}
        accent={accent}
      />

      <PageContainer>
        {(title || subtitle || headerLeft) && (
          <div className="mb-4 flex items-center gap-3">
            {headerLeft}
            <div>
              {title ? <h1 className="text-2xl font-bold">{title}</h1> : null}
              {subtitle ? <p className="text-gray-600 text-sm">{subtitle}</p> : null}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <section className="lg:col-span-2">
            <DayBasedPackFeed
              packs={packs}
              selectedDay={selectedDay}
              selectedDate={selectedDate}
              accent={accent}
              hideLeagueChips={hideLeagueChips}
              forceTeamSlugFilter={forceTeamSlugFilter}
            />
          </section>

          <aside className="lg:col-span-1 lg:sticky lg:top-4 self-start">
            <DayBasedLeaderboard
              packs={packs}
              selectedDay={selectedDay}
              selectedDate={selectedDate}
              accent={accent}
            />
            {sidebarBelow ? (
              <div className="mt-8">
                {sidebarBelow}
              </div>
            ) : null}
          </aside>
        </div>
      </PageContainer>
    </div>
  );
}


