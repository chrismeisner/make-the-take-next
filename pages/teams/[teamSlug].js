import React, { useState, useMemo } from 'react';
import Airtable from 'airtable';
import Layout from '../../components/Layout';
import LeaderboardTable from '../../components/LeaderboardTable';
import Link from 'next/link';
import { aggregateTakeStats } from '../../lib/leaderboard';

export async function getServerSideProps({ params }) {
  const { teamSlug } = params;
  const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY })
    .base(process.env.AIRTABLE_BASE_ID);

  // Fetch the team record matching the slug
  const teamRecords = await base('Teams')
    .select({
      filterByFormula: `{teamSlug}="${teamSlug}"`,
      maxRecords: 1,
    })
    .firstPage();
  if (!teamRecords.length) {
    return { notFound: true };
  }
  const teamRec = teamRecords[0];

  // Map fields for the team
  const team = {
    recordId: teamRec.id,
    teamSlug,
    teamID: teamRec.fields.teamID || '',
    teamName: teamRec.fields.teamName || '',
    teamNameFull: teamRec.fields.teamNameFull || teamRec.fields.teamName || '',
    teamType: teamRec.fields.teamType || '',
    teamLogo: Array.isArray(teamRec.fields.teamLogo)
      ? teamRec.fields.teamLogo.map(img => ({ url: img.url, filename: img.filename }))
      : [],
  };

  // Fetch packs linked to this team
  // Fetch packs for this team by matching teamID field
  const teamID = teamRec.fields.teamID;
  const packRecords = await base('Packs')
    .select({
      filterByFormula: `FIND("${teamID}", ARRAYJOIN({teamID}))`,
      maxRecords: 100,
    })
    .all();

  // Map packs and collect their linked Event IDs
  const rawPacks = packRecords.map(rec => ({
    recordId: rec.id,
    packURL: rec.fields.packURL,
    packTitle: rec.fields.packTitle || '(No Title)',
    packSummary: rec.fields.packSummary || '',
    packCover: Array.isArray(rec.fields.packCover) ? rec.fields.packCover.map(img => img.url) : [],
    eventIds: rec.fields.Event || [],
  }));
  // Batch-fetch all linked Event records
  const allEventIds = Array.from(new Set(rawPacks.flatMap(p => p.eventIds)));
  let eventRecs = [];
  if (allEventIds.length > 0) {
    const formula = `OR(${allEventIds.map(id => `RECORD_ID()="${id}"`).join(',')})`;
    eventRecs = await base('Events').select({ filterByFormula: formula, maxRecords: allEventIds.length }).all();
  }
  const eventMap = Object.fromEntries(eventRecs.map(er => [er.id, er.fields]));
  // Combine event details back into packs
  const packs = rawPacks.map(p => {
    const evId = Array.isArray(p.eventIds) ? p.eventIds[0] : p.eventIds;
    const evFields = evId && eventMap[evId];
    return {
      recordId: p.recordId,
      packURL: p.packURL,
      packTitle: p.packTitle,
      packSummary: p.packSummary,
      packCover: p.packCover,
      event: evFields
        ? { eventTime: evFields.eventTime || null, eventLeague: evFields.eventLeague || '' }
        : null,
    };
  });
  // Sort packs by most recent event time (descending)
  packs.sort((a, b) => {
    const aTime = a.event?.eventTime ? new Date(a.event.eventTime).getTime() : 0;
    const bTime = b.event?.eventTime ? new Date(b.event.eventTime).getTime() : 0;
    return bTime - aTime;
  });

  // Decorative start of leaderboard logging
  console.log(`🏆🏆 [teams] Team Leaderboard START for ${team.teamNameFull} (ID: ${team.recordId}) 🏆🏆`);
  // Log before fetching takes for leaderboard
  console.log(`🔍 [teams] Fetching takes for team ${team.teamNameFull} (teamID ${teamID}) 🔍`);
  // Fetch takes via the lookup 'teamID' field in the Takes table
  const takeRecs = await base('Takes')
    .select({
      filterByFormula: `FIND("${teamID}", ARRAYJOIN({teamID}))`,
    })
    .all();
  console.log(`📥 [teams] Fetched takes count: ${takeRecs.length} 📥`);
  // Log before aggregating stats
  console.log(`🧮 [teams] Aggregating team stats 🧮`);
  const takeCount = takeRecs.length;
  const teamStats = aggregateTakeStats(takeRecs);
  console.log(`✅ [teams] teamStats:`, teamStats);
  // Decorative end of leaderboard logging
  console.log(`🎉🎉🎉 [teams] Team Leaderboard COMPLETE for ${team.teamNameFull} 🎉🎉🎉`);

  // Fetch profiles to map phone -> profileID for usernames
  const allProfiles = await base('Profiles').select({ maxRecords: 5000 }).all();
  const phoneToProfileID = new Map();
  allProfiles.forEach(profile => {
    const { profileMobile, profileID } = profile.fields;
    if (profileMobile && profileID) {
      phoneToProfileID.set(profileMobile, profileID);
    }
  });
  // Build unified leaderboard data
  const leaderboard = teamStats.map(s => ({
    phone: s.phone,
    takes: s.takes,
    points: s.points,
    won: s.won,
    lost: s.lost,
    pushed: s.pushed,
    profileID: phoneToProfileID.get(s.phone) || null,
  }));
  return { props: { team, packs, takeCount, leaderboard } };
}

export default function TeamPage({ team, packs, takeCount, leaderboard }) {
  // State for selected sort option
  const [sortOption, setSortOption] = useState('recent');
  // Memoized sorted packs based on sortOption
  const sortedPacks = useMemo(() => {
    const arr = [...packs];
    switch (sortOption) {
      case 'oldest':
        return arr.sort((a, b) =>
          (a.event?.eventTime ? new Date(a.event.eventTime).getTime() : 0) -
          (b.event?.eventTime ? new Date(b.event.eventTime).getTime() : 0)
        );
      case 'title-asc':
        return arr.sort((a, b) => a.packTitle.localeCompare(b.packTitle));
      case 'title-desc':
        return arr.sort((a, b) => b.packTitle.localeCompare(a.packTitle));
      case 'recent':
      default:
        return arr.sort((a, b) =>
          (b.event?.eventTime ? new Date(b.event.eventTime).getTime() : 0) -
          (a.event?.eventTime ? new Date(a.event.eventTime).getTime() : 0)
        );
    }
  }, [packs, sortOption]);

  return (
    <Layout>
      <div className="space-y-6">
        <header className="flex items-center space-x-4">
          {team.teamLogo[0] && (
            <img
              src={team.teamLogo[0].url}
              alt={team.teamNameFull}
              className="w-16 h-16 rounded"
            />
          )}
          <h1 className="text-3xl font-bold">{team.teamNameFull}</h1>
        </header>

        {/* Team Leaderboard */}
        <section>
          <h2 className="text-2xl font-semibold">Team Leaderboard</h2>
          <p className="mt-2 text-lg">Total takes: {takeCount}</p>
          {leaderboard.length > 0 ? (
            <LeaderboardTable leaderboard={leaderboard} />
          ) : (
            <p className="text-gray-600 mt-2">No takes for this team yet.</p>
          )}
        </section>

        {/* Pack list */}
        <section>
          <h2 className="text-2xl font-semibold">Packs</h2>
          {/* Sort dropdown */}
          <div className="mt-2 flex items-center space-x-2">
            <label htmlFor="sort" className="text-sm font-medium">Sort by:</label>
            <select
              id="sort"
              value={sortOption}
              onChange={(e) => setSortOption(e.target.value)}
              className="border rounded p-1 text-sm"
            >
              <option value="recent">Most recent event first</option>
              <option value="oldest">Oldest event first</option>
              <option value="title-asc">Pack title A→Z</option>
              <option value="title-desc">Pack title Z→A</option>
            </select>
          </div>
          {sortedPacks.length > 0 ? (
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {sortedPacks.map(pack => (
                <div
                  key={pack.recordId}
                  className="border rounded-lg overflow-hidden shadow-sm hover:shadow-md transition"
                >
                  {pack.packCover[0] && (
                    <img
                      src={pack.packCover[0]}
                      alt={pack.packTitle}
                      className="w-full h-32 object-cover"
                    />
                  )}
                  <div className="p-4">
                    <h3 className="text-xl font-semibold mb-2">
                      <Link href={`/packs/${pack.packURL}`} className="hover:underline text-blue-600">
                        {pack.packTitle}
                      </Link>
                    </h3>
                    <p className="text-gray-700 text-sm">{pack.packSummary}</p>
                    {/* Show event time if available */}
                    {pack.event?.eventTime && (
                      <p className="mt-2 text-sm text-gray-500">
                        {new Date(pack.event.eventTime).toLocaleString()}
                        {pack.event.eventLeague && ` — ${pack.event.eventLeague}`}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-600 mt-2">No packs found for this team.</p>
          )}
        </section>
      </div>
    </Layout>
  );
} 