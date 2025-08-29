import React, { useMemo, useState } from 'react';
import Airtable from 'airtable';
import Link from 'next/link';

export async function getServerSideProps({ params }) {
  const { team } = params;
  const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY })
    .base(process.env.AIRTABLE_BASE_ID);

  // Normalize path segment to compare against Teams.teamName (case-insensitive)
  // e.g., "/red-sox" => "Red Sox" matching LOWER({teamName})
  const normalized = decodeURIComponent(String(team || ''))
    .replace(/-/g, ' ')
    .trim()
    .toLowerCase();

  // Fetch the team record by teamName (case-insensitive)
  const teamRecords = await base('Teams')
    .select({
      filterByFormula: `LOWER({teamName}) = "${normalized}"`,
      maxRecords: 1,
    })
    .firstPage();

  if (!teamRecords.length) {
    return { notFound: true };
  }

  const teamRec = teamRecords[0];
  const teamData = {
    recordId: teamRec.id,
    teamID: teamRec.fields.teamID || '',
    teamName: teamRec.fields.teamName || '',
    teamNameFull: teamRec.fields.teamNameFull || teamRec.fields.teamName || '',
    teamLogo: Array.isArray(teamRec.fields.teamLogo)
      ? teamRec.fields.teamLogo.map(img => ({ url: img.url, filename: img.filename }))
      : [],
  };

  // Fetch packs linked to this team via either:
  // 1) Packs.Teams link contains this team record ID, OR
  // 2) Packs.teamID lookup contains this team's teamID value
  const teamIdValue = teamData.teamID;
  let filterFormula = `FIND("${teamRec.id}", ARRAYJOIN({Teams}))`;
  if (teamIdValue) {
    filterFormula = `OR(${filterFormula}, FIND("${teamIdValue}", ARRAYJOIN({teamID})))`;
  }

  const packRecords = await base('Packs')
    .select({
      filterByFormula: filterFormula,
      maxRecords: 200,
    })
    .all();

  const packs = packRecords.map(rec => {
    const f = rec.fields || {};
    const packCover = Array.isArray(f.packCover) && f.packCover.length > 0
      ? f.packCover[0].url
      : null;
    return {
      recordId: rec.id,
      packURL: f.packURL || '',
      packTitle: f.packTitle || 'Untitled Pack',
      packSummary: f.packSummary || '',
      packCover,
      // Use lookup if available; otherwise null
      eventTime: f.eventTime || null,
    };
  });

  // Sort packs by most recent event time (descending)
  packs.sort((a, b) => {
    const aTime = a.eventTime ? new Date(a.eventTime).getTime() : 0;
    const bTime = b.eventTime ? new Date(b.eventTime).getTime() : 0;
    return bTime - aTime;
  });

  return { props: { team: teamData, packs } };
}

export default function TeamRootPage({ team, packs }) {
  const [sortOption, setSortOption] = useState('recent');
  const sortedPacks = useMemo(() => {
    const arr = [...packs];
    switch (sortOption) {
      case 'oldest':
        return arr.sort((a, b) => (a.eventTime ? new Date(a.eventTime).getTime() : 0) - (b.eventTime ? new Date(b.eventTime).getTime() : 0));
      case 'title-asc':
        return arr.sort((a, b) => a.packTitle.localeCompare(b.packTitle));
      case 'title-desc':
        return arr.sort((a, b) => b.packTitle.localeCompare(a.packTitle));
      case 'recent':
      default:
        return arr.sort((a, b) => (b.eventTime ? new Date(b.eventTime).getTime() : 0) - (a.eventTime ? new Date(a.eventTime).getTime() : 0));
    }
  }, [packs, sortOption]);

  return (
    <div className="space-y-6">
      <header className="flex items-center space-x-4">
        {team.teamLogo[0] && (
          <img
            src={team.teamLogo[0].url}
            alt={team.teamNameFull || team.teamName}
            className="w-16 h-16 rounded"
          />
        )}
        <div>
          <h1 className="text-3xl font-bold">{team.teamNameFull || team.teamName}</h1>
          <p className="text-gray-600">Showing packs for this team</p>
        </div>
      </header>

      <section>
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-semibold">Packs</h2>
          <div className="flex items-center space-x-2">
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
        </div>

        {sortedPacks.length > 0 ? (
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {sortedPacks.map((pack) => (
              <div key={pack.recordId} className="border rounded-lg overflow-hidden shadow-sm hover:shadow-md transition">
                <div className="w-full aspect-square relative bg-gray-100">
                  {pack.packCover ? (
                    <img src={pack.packCover} alt={pack.packTitle} className="absolute inset-0 w-full h-full object-cover" />
                  ) : (
                    <div className="absolute inset-0 w-full h-full flex items-center justify-center text-xs text-gray-500">No Cover</div>
                  )}
                </div>
                <div className="p-4">
                  <h3 className="text-xl font-semibold mb-2">
                    <Link href={`/packs/${pack.packURL}`} className="hover:underline text-blue-600">
                      {pack.packTitle}
                    </Link>
                  </h3>
                  {pack.packSummary && (
                    <p className="text-gray-700 text-sm">{pack.packSummary}</p>
                  )}
                  {pack.eventTime && (
                    <p className="mt-2 text-sm text-gray-500">
                      {new Date(pack.eventTime).toLocaleString()}
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
  );
}
