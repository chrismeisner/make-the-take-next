import React from 'react';
import Airtable from 'airtable';
import Link from 'next/link';

export async function getServerSideProps() {
  const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY })
    .base(process.env.AIRTABLE_BASE_ID);

  const records = await base('Teams')
    .select({
      sort: [{ field: 'teamName', direction: 'asc' }],
      maxRecords: 500,
    })
    .all();

  const teams = records.map((rec) => {
    const f = rec.fields || {};
    let logoUrl = null;
    if (Array.isArray(f.teamLogo) && f.teamLogo.length > 0) {
      logoUrl = f.teamLogo[0].url;
    } else if (f.teamLogoURL) {
      logoUrl = f.teamLogoURL;
    }
    return {
      recordId: rec.id,
      teamName: f.teamName || 'Unknown Team',
      teamNameFull: f.teamNameFull || f.teamName || 'Unknown Team',
      teamLeague: f.teamLeague || '',
      teamAbbreviation: f.teamAbbreviation || '',
      logoUrl,
    };
  });

  return { props: { teams } };
}

function toPathFromTeamName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/--+/g, '-')
    .replace(/^-|-$/g, '');
}

export default function TeamsIndex({ teams }) {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold">Teams</h1>
        <p className="text-gray-600 mt-1">Browse all teams and view their packs.</p>
      </header>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {teams.map((t) => {
          const path = `/${toPathFromTeamName(t.teamName)}`;
          return (
            <Link key={t.recordId} href={path} className="group block border rounded-lg p-3 hover:shadow-md transition">
              <div className="flex items-center space-x-3">
                {t.logoUrl ? (
                  <img src={t.logoUrl} alt={t.teamNameFull} className="w-10 h-10 object-contain rounded" />
                ) : (
                  <div className="w-10 h-10 bg-gray-200 rounded" />
                )}
                <div>
                  <div className="font-medium group-hover:underline">{t.teamNameFull}</div>
                  {t.teamLeague && (
                    <div className="text-xs text-gray-500">{t.teamLeague}</div>
                  )}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

