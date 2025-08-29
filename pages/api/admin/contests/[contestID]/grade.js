import Airtable from "airtable";
import { getToken } from "next-auth/jwt";
import { aggregateTakeStats } from "../../../../../lib/leaderboard";

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY })
  .base(process.env.AIRTABLE_BASE_ID);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) {
    return res.status(401).json({ success: false, error: "Unauthorized" });
  }

  const { contestID } = req.query;
  if (!contestID) {
    return res.status(400).json({ success: false, error: "Missing contestID" });
  }

  try {
    const startedAt = Date.now();
    console.log(`\n\n🏁  [grade-contest] Start grading contest → id: ${contestID}`);
    if (token?.email || token?.name) {
      console.log(`🔐  Admin user: ${token?.email || token?.name}`);
    }
    // 1) Fetch the contest record. Accept either contestID or Airtable record ID
    let contestRec;
    const byContestId = await base("Contests")
      .select({ filterByFormula: `{contestID} = "${contestID}"`, maxRecords: 1 })
      .firstPage();
    if (byContestId.length) {
      contestRec = byContestId[0];
    } else {
      try {
        const byRecordId = await base("Contests").find(contestID);
        if (byRecordId) contestRec = byRecordId;
      } catch (_) {
        // ignore; fall through to not found
      }
    }

    if (!contestRec) {
      console.log(`❌  [grade-contest] Contest not found: ${contestID}`);
      return res.status(404).json({ success: false, error: `Contest not found for id="${contestID}"` });
    }
    const f = contestRec.fields;
    const linkedPackIDs = f.Packs || [];
    console.log(`📦  Contest resolved: airtableId=${contestRec.id} | packs=${linkedPackIDs.length}`);

    // If no packs, we can still mark graded with no winner
    if (!linkedPackIDs.length) {
      const [updated] = await base("Contests").update([
        { id: contestRec.id, fields: { contestStatus: "graded", contestWinner: [] } },
      ]);
      const elapsed = Date.now() - startedAt;
      console.log(`🟡  No packs linked. Marked graded with no winner. ⏱️ ${elapsed}ms`);
      return res.status(200).json({ success: true, graded: true, winner: null, record: updated });
    }

    // 2) Gather propIDs from those packs
    const formulaPacks = `OR(${linkedPackIDs.map((id) => `RECORD_ID()="${id}"`).join(",")})`;
    const packRecords = await base("Packs").select({ filterByFormula: formulaPacks, maxRecords: 100 }).all();
    console.log(`📦  Loaded packs: ${packRecords.length}`);

    let allPropIDs = [];
    for (const packRec of packRecords) {
      const pf = packRec.fields;
      const linkedPropRecordIDs = pf.Props || [];
      if (linkedPropRecordIDs.length) {
        const formulaProps = `OR(${linkedPropRecordIDs.map((id) => `RECORD_ID()="${id}"`).join(",")})`;
        const propRecs = await base("Props").select({ filterByFormula: formulaProps, maxRecords: 500 }).all();
        const packPropIDs = propRecs.map((pr) => pr.fields.propID).filter(Boolean);
        allPropIDs.push(...packPropIDs);
      }
    }

    const uniquePropIDs = [...new Set(allPropIDs)];
    console.log(`🧩  Distinct props across packs: ${uniquePropIDs.length}`);
    if (!uniquePropIDs.length) {
      const [updated] = await base("Contests").update([
        { id: contestRec.id, fields: { contestStatus: "graded", contestWinner: [] } },
      ]);
      const elapsed = Date.now() - startedAt;
      console.log(`🟡  No props found. Marked graded with no winner. ⏱️ ${elapsed}ms`);
      return res.status(200).json({ success: true, graded: true, winner: null, record: updated });
    }

    // 3) Gather all non-overwritten Takes and filter by these propIDs
    const allTakes = await base("Takes")
      .select({ maxRecords: 5000, filterByFormula: `AND({takeStatus} != "overwritten")` })
      .all();
    const relevantTakes = allTakes.filter((takeRec) => uniquePropIDs.includes(takeRec.fields.propID));
    console.log(`🎯  Takes: fetched=${allTakes.length}, relevant=${relevantTakes.length}`);

    // 4) Aggregate stats (sorted by points desc)
    const statsList = aggregateTakeStats(relevantTakes);
    console.log(`📊  Leaderboard entries: ${statsList.length}`);

    // 5) Determine the winner (most points)
    const top = statsList[0];
    if (top) {
      console.log(`🏆  Top performer: phone=${top.phone}, points=${top.points}`);
    }

    // If no relevant takes, just mark graded with no winner
    if (!top) {
      const [updated] = await base("Contests").update([
        { id: contestRec.id, fields: { contestStatus: "graded", contestWinner: [] } },
      ]);
      const elapsed = Date.now() - startedAt;
      console.log(`🟡  No relevant takes. Marked graded with no winner. ⏱️ ${elapsed}ms`);
      return res.status(200).json({ success: true, graded: true, winner: null, record: updated });
    }

    // 6) Map phone -> Profile record ID for linking
    const allProfiles = await base("Profiles").select({ maxRecords: 5000 }).all();
    const phoneToProfileRecordId = new Map();
    const phoneToProfile = new Map();
    allProfiles.forEach((profile) => {
      const { profileMobile, profileID, profileUsername } = profile.fields || {};
      if (profileMobile) {
        phoneToProfileRecordId.set(profileMobile, profile.id);
        phoneToProfile.set(profileMobile, { profileID: profileID || null, profileUsername: profileUsername || null });
      }
    });

    const winnerProfileRecordId = phoneToProfileRecordId.get(top.phone) || null;
    const winnerProfileMeta = phoneToProfile.get(top.phone) || null;
    if (winnerProfileRecordId) {
      console.log(`👤  Winner profile found: recordId=${winnerProfileRecordId}`);
    } else {
      console.log(`🕵️  No matching profile for phone=${top.phone}. Proceeding without link.`);
    }

    // 7) Update contest with winner and status
    const fields = { contestStatus: "graded" };
    if (winnerProfileRecordId) {
      fields.contestWinner = [winnerProfileRecordId];
    } else {
      fields.contestWinner = [];
    }

    const [updated] = await base("Contests").update([{ id: contestRec.id, fields }]);
    const elapsed = Date.now() - startedAt;
    console.log(`✅  Contest graded successfully: contestId=${contestRec.id} | winnerLinked=${Boolean(winnerProfileRecordId)} ⏱️ ${elapsed}ms`);

    return res.status(200).json({
      success: true,
      graded: true,
      winner: winnerProfileRecordId
        ? { phone: top.phone, points: top.points, profileRecordId: winnerProfileRecordId, ...winnerProfileMeta }
        : { phone: top.phone, points: top.points, profileRecordId: null },
      record: updated,
    });
  } catch (err) {
    console.error("💥  [grade-contest] Error =>", err);
    return res.status(500).json({ success: false, error: err.message || "Internal server error" });
  }
}


