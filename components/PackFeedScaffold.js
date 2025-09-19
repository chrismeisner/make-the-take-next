import { useEffect, useState } from 'react';
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
}) {
  const [selectedDay, setSelectedDay] = useState(initialDay);
  const [selectedDate, setSelectedDate] = useState(null);

  useEffect(() => {
    // No-op placeholder to allow parent to pass selectedDate via props later if needed
  }, []);

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
          </aside>
        </div>
      </PageContainer>
    </div>
  );
}


