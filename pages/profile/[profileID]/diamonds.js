import Airtable from "airtable";
import Link from "next/link";
import { useMemo, useState } from "react";
import PageContainer from "../../../components/PageContainer";

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY })
  .base(process.env.AIRTABLE_BASE_ID);

export default function ProfileDiamondsPage({ profileID, profileUsername, achievements = [] }) {
  const [sortOrder, setSortOrder] = useState("desc"); // desc = newest first

  const sortedAchievements = useMemo(() => {
    const toTimestamp = (a) => {
      const t = new Date(a.createdTime || 0).getTime();
      return Number.isFinite(t) ? t : 0;
    };
    const arr = Array.isArray(achievements) ? [...achievements] : [];
    return arr.sort((a, b) => {
      const at = toTimestamp(a);
      const bt = toTimestamp(b);
      return sortOrder === "desc" ? bt - at : at - bt;
    });
  }, [achievements, sortOrder]);

  return (
    <PageContainer>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">
          {profileUsername ? `@${profileUsername}` : profileID} Diamonds
        </h1>
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

      {sortedAchievements.length === 0 ? (
        <p className="text-gray-700">No diamonds yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full bg-white border">
            <thead>
              <tr className="border-b">
                <th className="px-4 py-2 text-left">Date</th>
                <th className="px-4 py-2 text-left">Title</th>
                <th className="px-4 py-2 text-left">Description</th>
                <th className="px-4 py-2 text-left">Key</th>
                <th className="px-4 py-2 text-left">Value</th>
              </tr>
            </thead>
            <tbody>
              {sortedAchievements.map((a) => (
                <tr key={a.id} className="border-b">
                  <td className="px-4 py-2">{a.createdTime ? new Date(a.createdTime).toLocaleString() : ""}</td>
                  <td className="px-4 py-2">{a.achievementTitle || ""}</td>
                  <td className="px-4 py-2">{a.achievementDescription || ""}</td>
                  <td className="px-4 py-2 font-mono text-xs">{a.achievementKey || ""}</td>
                  <td className="px-4 py-2">{a.achievementValue ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PageContainer>
  );
}

export async function getServerSideProps({ params }) {
  const { profileID } = params;
  try {
    // Resolve the profile record by profileID to get record id and username
    const profs = await base("Profiles")
      .select({ filterByFormula: `{profileID}="${profileID}"`, maxRecords: 1 })
      .firstPage();
    if (profs.length === 0) {
      return { notFound: true };
    }
    const profileRecord = profs[0];
    const profileRecordId = profileRecord.id;
    const profileUsername = profileRecord.fields.profileUsername || null;

    // Fetch Achievements by profileID string field if available; fallback to link lookup
    let achRecs = [];
    try {
      achRecs = await base("Achievements")
        .select({ filterByFormula: `{profileID}="${profileID}"`, maxRecords: 5000 })
        .all();
      if (achRecs.length === 0) {
        const fallbackFormula = `FIND('${profileRecordId}', ARRAYJOIN({achievementProfile}))>0`;
        achRecs = await base("Achievements")
          .select({ filterByFormula: fallbackFormula, maxRecords: 5000 })
          .all();
      }
    } catch (_) {
      const fallbackFormula = `FIND('${profileRecordId}', ARRAYJOIN({achievementProfile}))>0`;
      achRecs = await base("Achievements")
        .select({ filterByFormula: fallbackFormula, maxRecords: 5000 })
        .all();
    }

    const achievements = achRecs.map((r) => ({
      id: r.id,
      achievementKey: r.fields.achievementKey || "",
      achievementTitle: r.fields.achievementTitle || "",
      achievementDescription: r.fields.achievementDescription || "",
      achievementValue: typeof r.fields.achievementValue === "number" ? r.fields.achievementValue : 0,
      createdTime: r._rawJson?.createdTime || null,
    }));

    return { props: { profileID, profileUsername, achievements } };
  } catch (err) {
    console.error("[Diamonds page] Error:", err);
    return { notFound: true };
  }
}


