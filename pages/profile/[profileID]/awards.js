import Airtable from "airtable";
import Link from "next/link";
import { useMemo, useState } from "react";
import PageContainer from "../../../components/PageContainer";

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY })
  .base(process.env.AIRTABLE_BASE_ID);

export default function ProfileAwardsPage({ profileID, profileUsername, winnerPacks = [], userTakesByPack = {}, userPointsByPack = {}, userResultsByPack = {} }) {
  const [sortOrder, setSortOrder] = useState("desc"); // desc = most recent first
  const [expandedRows, setExpandedRows] = useState({});

  const sortedPacks = useMemo(() => {
    const toTimestamp = (pack) => {
      const value = pack.packDate || pack.eventTime || pack.createdTime || 0;
      const t = new Date(value).getTime();
      return Number.isFinite(t) ? t : 0;
    };
    const packsCopy = Array.isArray(winnerPacks) ? [...winnerPacks] : [];
    return packsCopy.sort((a, b) => {
      const at = toTimestamp(a);
      const bt = toTimestamp(b);
      return sortOrder === "desc" ? bt - at : at - bt;
    });
  }, [winnerPacks, sortOrder]);

  return (
    <PageContainer>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">{profileUsername ? `@${profileUsername}` : profileID} Awards</h1>
        <div className="flex items-center gap-3">
          <label className="text-sm text-gray-700">
            <span className="mr-2">Sort</span>
            <select
              className="border rounded px-2 py-1 text-sm"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
            >
              <option value="desc">Most recent</option>
              <option value="asc">Oldest</option>
            </select>
          </label>
          <Link href={`/profile/${encodeURIComponent(profileID)}`} className="underline text-blue-600">
            Back to Profile
          </Link>
        </div>
      </div>

      {sortedPacks.length === 0 ? (
        <p className="text-gray-700">No awards yet.</p>
      ) : (
        <>
          <h2 className="text-lg font-semibold mb-2">Packs Won</h2>
          <div className="overflow-x-auto">
          <table className="min-w-full bg-white border rounded">
            <thead>
              <tr className="bg-gray-50">
                <th className="px-4 py-2 text-left text-sm font-semibold text-gray-700">Pack</th>
                <th className="px-4 py-2 text-left text-sm font-semibold text-gray-700">Date</th>
                <th className="px-4 py-2 text-left text-sm font-semibold text-gray-700">League</th>
                <th className="px-4 py-2 text-left text-sm font-semibold text-gray-700">Your Takes</th>
                <th className="px-4 py-2 text-left text-sm font-semibold text-gray-700">W-L-P</th>
                <th className="px-4 py-2 text-left text-sm font-semibold text-gray-700">Points</th>
                <th className="px-4 py-2 text-left text-sm font-semibold text-gray-700">Link</th>
              </tr>
            </thead>
            <tbody>
              {sortedPacks.map((p) => {
                const dateStr = (p.packDate || p.eventTime || p.createdTime)
                  ? new Date(p.packDate || p.eventTime || p.createdTime).toLocaleString()
                  : '';
                const takes = userTakesByPack[p.packID] || [];
                const isExpanded = Boolean(expandedRows[p.packID]);
                const packPoints = Number.isFinite(userPointsByPack[p.packID]) ? userPointsByPack[p.packID] : 0;
                const results = userResultsByPack[p.packID] || { won: 0, lost: 0, pushed: 0, pending: 0 };
                return (
                  <>
                    <tr key={(p.packID || p.airtableId) + '-row'} className="border-t">
                      <td className="px-4 py-2 align-middle">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded bg-gray-100 overflow-hidden flex-shrink-0">
                            {p.packCover ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={p.packCover} alt="Pack cover" className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-xs text-gray-500">No Cover</div>
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="font-medium truncate">{p.packTitle || p.packURL || 'Untitled Pack'}</div>
                            {p.winnerProfileID && (
                              <div className="text-xs text-gray-600">🏆 @{p.winnerProfileID}</div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-2 align-middle text-sm text-gray-700">{dateStr}</td>
                      <td className="px-4 py-2 align-middle text-sm text-gray-700">{p.packLeague || ''}</td>
                      <td className="px-4 py-2 align-middle text-sm text-gray-700">
                        <div className="flex items-center gap-2">
                          <span>{takes.length}</span>
                          {takes.length > 0 && (
                            <button
                              type="button"
                              onClick={() => setExpandedRows((prev) => ({ ...prev, [p.packID]: !isExpanded }))}
                              className="text-blue-600 underline text-xs"
                            >
                              {isExpanded ? 'Hide' : 'View'}
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2 align-middle text-sm text-gray-800">{results.won}-{results.lost}-{results.pushed}</td>
                      <td className="px-4 py-2 align-middle text-sm text-gray-800 font-medium">{Math.round(packPoints)}</td>
                      <td className="px-4 py-2 align-middle">
                        {p.packURL ? (
                          <Link href={`/packs/${p.packURL}`} className="text-blue-600 underline text-sm">View Pack</Link>
                        ) : (
                          <span className="text-gray-400 text-sm">—</span>
                        )}
                      </td>
                    </tr>
                    {isExpanded && takes.length > 0 && (
                      <tr key={(p.packID || p.airtableId) + '-exp'} className="bg-gray-50">
                        <td colSpan={7} className="px-4 py-3">
                          <div className="text-sm text-gray-800">Your recent takes in this pack</div>
                          <ul className="mt-2 space-y-1">
                            {takes
                              .slice()
                              .sort((a, b) => new Date(b.createdTime) - new Date(a.createdTime))
                              .slice(0, 5)
                              .map((t) => (
                                <li key={t.takeID} className="flex items-center justify-between">
                                  <div className="min-w-0">
                                    <span className="font-medium truncate">{t.takeTitle || t.propTitle || 'Untitled Take'}</span>
                                    <span className="ml-2 text-xs text-gray-600">{new Date(t.createdTime).toLocaleString()}</span>
                                  </div>
                                  <div className="text-xs">
                                    <span className="mr-2">{Math.round(t.takePTS)}</span>
                                    <span className="inline-block px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">
                                      {t.takeResult || 'Pending'}
                                    </span>
                                  </div>
                                </li>
                              ))}
                          </ul>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
        </>
      )}
    </PageContainer>
  );
}

export async function getServerSideProps({ params }) {
  const { profileID } = params;
  try {
    // Resolve the profile record by profileID to get record id and username
    const profs = await base('Profiles')
      .select({ filterByFormula: `{profileID}="${profileID}"`, maxRecords: 1 })
      .firstPage();
    if (profs.length === 0) {
      return { notFound: true };
    }
    const profileRecord = profs[0];
    const profileRecordId = profileRecord.id;
    const profileUsername = profileRecord.fields.profileUsername || null;

    // Find packs where this profile is the winner and pack is graded
    const winnerFormula = `OR(AND(LOWER({packStatus})='graded', {winnerProfileID}='${profileID}'), AND(LOWER({packStatus})='graded', FIND('${profileRecordId}', ARRAYJOIN({packWinner}))>0))`;
    const packRecords = await base('Packs')
      .select({ filterByFormula: winnerFormula, maxRecords: 5000 })
      .all();

    const winnerPacks = packRecords.map((rec) => {
      const f = rec.fields || {};
      const coverUrl = Array.isArray(f.packCover) && f.packCover.length > 0 ? f.packCover[0].url : null;
      const propEventRollup = Array.isArray(f.propEventRollup) ? f.propEventRollup : [];
      // Compute earliest event time from propEventRollup as pack date
      let earliestEventIso = null;
      if (propEventRollup.length > 0) {
        const times = propEventRollup
          .map((t) => new Date(t).getTime())
          .filter((t) => Number.isFinite(t));
        if (times.length > 0) {
          const minMs = Math.min(...times);
          earliestEventIso = new Date(minMs).toISOString();
        }
      }
      return {
        airtableId: rec.id,
        packID: f.packID || rec.id,
        packURL: f.packURL || '',
        packTitle: f.packTitle || '',
        packCover: coverUrl,
        eventTime: f.eventTime || null,
        propEventRollup,
        packDate: earliestEventIso || f.eventTime || rec._rawJson?.createdTime || null,
        winnerProfileID: f.winnerProfileID || null,
        packLeague: (f.packLeague || '') ? String(f.packLeague).toLowerCase() : '',
        createdTime: rec._rawJson?.createdTime || null,
      };
    });

    // Sort by packDate desc (most recent first)
    winnerPacks.sort((a, b) => {
      const at = a.packDate ? new Date(a.packDate).getTime() : 0;
      const bt = b.packDate ? new Date(b.packDate).getTime() : 0;
      return bt - at;
    });

    // Fetch user's latest takes (by Profile link or phone) and group by packID
    const profileMobile = profileRecord.fields.profileMobile || null;
    const userClause = [
      `FIND('${profileRecordId}', ARRAYJOIN({Profile}))>0`,
      profileMobile ? `{takeMobile}='${profileMobile}'` : null,
    ].filter(Boolean);
    let userTakesByPack = {};
    let userPointsByPack = {};
    let userResultsByPack = {};
    if (userClause.length > 0) {
      const takesFormula = `AND({takeStatus} = 'latest', OR(${userClause.join(',')}))`;
      const takeRecords = await base('Takes')
        .select({ filterByFormula: takesFormula, maxRecords: 5000 })
        .all();
      const map = new Map();
      const totals = new Map();
      const resultTotals = new Map();
      for (const tr of takeRecords) {
        const tf = tr.fields || {};
        const packIDs = Array.isArray(tf.packID) ? tf.packID : tf.packID ? [tf.packID] : [];
        const takeLite = {
          takeID: tf.takeID || tr.id,
          takeTitle: tf.takeTitle || tf.propTitle || null,
          propTitle: tf.propTitle || null,
          takePTS: Number.isFinite(tf.takePTS) ? tf.takePTS : Number(tf.takePTS) || 0,
          takeResult: tf.takeResult || null,
          createdTime: tr._rawJson?.createdTime || new Date().toISOString(),
        };
        const rLower = String(takeLite.takeResult || '').toLowerCase();
        for (const pid of packIDs) {
          if (!pid) continue;
          if (!map.has(pid)) map.set(pid, []);
          map.get(pid).push(takeLite);
          const prev = totals.get(pid) || 0;
          totals.set(pid, prev + (Number.isFinite(takeLite.takePTS) ? takeLite.takePTS : 0));
          if (!resultTotals.has(pid)) resultTotals.set(pid, { won: 0, lost: 0, pushed: 0, pending: 0 });
          const agg = resultTotals.get(pid);
          if (rLower === 'won') agg.won += 1;
          else if (rLower === 'lost') agg.lost += 1;
          else if (rLower === 'push' || rLower === 'pushed') agg.pushed += 1;
          else if (rLower === 'pending') agg.pending += 1;
          resultTotals.set(pid, agg);
        }
      }
      userTakesByPack = Object.fromEntries([...map.entries()]);
      userPointsByPack = Object.fromEntries([...totals.entries()]);
      userResultsByPack = Object.fromEntries([...resultTotals.entries()]);
    }

    return { props: { profileID, profileUsername, winnerPacks, userTakesByPack, userPointsByPack, userResultsByPack } };
  } catch (err) {
    console.error('[Awards page] Error:', err);
    return { notFound: true };
  }
}



