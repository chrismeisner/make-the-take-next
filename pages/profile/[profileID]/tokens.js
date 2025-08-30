import Airtable from "airtable";
import Link from "next/link";
import { useMemo, useState } from "react";
import PageContainer from "../../../components/PageContainer";

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(
  process.env.AIRTABLE_BASE_ID
);

export default function ProfileTokensPage({ profileID, achievements = [], exchanges = [] }) {
  const [sortOrder, setSortOrder] = useState("desc"); // desc = newest first

  const diamondsTotal = useMemo(
    () => (Array.isArray(achievements) ? achievements.reduce((sum, a) => sum + (a.achievementValue || 0), 0) : 0),
    [achievements]
  );

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

  const sortedExchanges = useMemo(() => {
    const toTimestamp = (e) => {
      const t = new Date(e.createdTime || 0).getTime();
      return Number.isFinite(t) ? t : 0;
    };
    const arr = Array.isArray(exchanges) ? [...exchanges] : [];
    return arr.sort((a, b) => toTimestamp(b) - toTimestamp(a));
  }, [exchanges]);

  return (
    <PageContainer>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">{profileID} Tokens</h1>
        <div className="flex items-center gap-3">
          <label className="text-sm text-gray-700">
            <span className="mr-2">Sort Achievements</span>
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

      <div className="mb-6">
        <div className="text-lg font-semibold">Diamonds total: {diamondsTotal}</div>
        <div className="text-sm text-gray-600">Diamonds are displayed on the frontend; tokens are the backend unit.</div>
      </div>

      <h2 className="text-xl font-bold mb-2">Diamonds (Achievements)</h2>
      {sortedAchievements.length === 0 ? (
        <p className="text-gray-700">No diamonds yet.</p>
      ) : (
        <div className="overflow-x-auto mb-8">
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

      <h2 className="text-xl font-bold mb-2">Exchanges</h2>
      {sortedExchanges.length === 0 ? (
        <p className="text-gray-700">No exchanges yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full bg-white border">
            <thead>
              <tr className="border-b">
                <th className="px-4 py-2 text-left">Date</th>
                <th className="px-4 py-2 text-left">Item</th>
                <th className="px-4 py-2 text-left">Tokens</th>
                <th className="px-4 py-2 text-left">Status</th>
              </tr>
            </thead>
            <tbody>
              {sortedExchanges.map((e) => (
                <tr key={e.exchangeID} className="border-b">
                  <td className="px-4 py-2">{e.createdTime ? new Date(e.createdTime).toLocaleString() : ""}</td>
                  <td className="px-4 py-2">{e.itemNames?.join(", ") || e.exchangeItem?.join(", ") || ""}</td>
                  <td className="px-4 py-2">{e.exchangeTokens ?? 0}</td>
                  <td className="px-4 py-2">{e.exchangeStatus || "requested"}</td>
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
    const profs = await base("Profiles").select({ filterByFormula: `{profileID}="${profileID}"`, maxRecords: 1 }).firstPage();
    if (profs.length === 0) return { notFound: true };
    const profileRecord = profs[0];

    // Fetch Achievements (diamonds)
    let achRecs = [];
    try {
      achRecs = await base("Achievements")
        .select({ filterByFormula: `{profileID}="${profileID}"`, maxRecords: 5000 })
        .all();
      if (achRecs.length === 0) {
        const fallbackFormula = `FIND('${profileRecord.id}', ARRAYJOIN({achievementProfile}))>0`;
        achRecs = await base("Achievements")
          .select({ filterByFormula: fallbackFormula, maxRecords: 5000 })
          .all();
      }
    } catch (_) {
      const fallbackFormula = `FIND('${profileRecord.id}', ARRAYJOIN({achievementProfile}))>0`;
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

    // Fetch Exchanges for this profile
    const exchFilter = `{profileID}="${profileID}"`;
    const exchRecs = await base("Exchanges").select({ filterByFormula: exchFilter, maxRecords: 5000 }).all();
    const exchangesRaw = exchRecs.map((r) => ({
      exchangeID: r.id,
      exchangeTokens: r.fields.exchangeTokens || 0,
      exchangeItem: Array.isArray(r.fields.exchangeItem) ? r.fields.exchangeItem : [],
      exchangeStatus: r.fields.exchangeStatus || null,
      createdTime: r._rawJson?.createdTime || null,
    }));

    // Resolve item names in one batch
    const uniqueItemIds = [
      ...new Set(
        exchangesRaw
          .flatMap((e) => e.exchangeItem || [])
          .filter((id) => typeof id === "string" && id.trim())
      ),
    ];
    let idToName = {};
    if (uniqueItemIds.length > 0) {
      const orClause = uniqueItemIds.map((id) => `RECORD_ID()="${id}"`).join(",");
      const items = await base("Items")
        .select({ filterByFormula: `OR(${orClause})`, maxRecords: uniqueItemIds.length })
        .all();
      items.forEach((it) => {
        idToName[it.id] = it.fields.itemName || it.id;
      });
    }

    const exchanges = exchangesRaw.map((e) => ({
      ...e,
      itemNames: Array.isArray(e.exchangeItem) ? e.exchangeItem.map((id) => idToName[id] || id) : [],
    }));

    return { props: { profileID, achievements, exchanges } };
  } catch (err) {
    console.error("[Tokens page] Error:", err);
    return { notFound: true };
  }
}




