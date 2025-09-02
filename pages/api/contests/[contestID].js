// File: /pages/api/contests/[contestID].js

import { getToken } from "next-auth/jwt";
import { createRepositories } from '../../../lib/dal/factory';

export default async function handler(req, res) {
  const { contestID } = req.query;

  if (!contestID) {
    return res.status(400).json({
      success: false,
      error: "Missing contestID in the query",
    });
  }

  // Admin: update linked Packs on a contest
  if (req.method === "PATCH") {
    try {
      const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
      if (!token) {
        return res.status(401).json({ success: false, error: "Unauthorized" });
      }

      const { packURLs } = req.body || {};
      if (!Array.isArray(packURLs)) {
        return res.status(400).json({ success: false, error: "Must provide packURLs array" });
      }

      const { contests } = createRepositories();
      const updated = await contests.linkPacks(contestID, packURLs);
      if (!updated) {
        return res.status(404).json({ success: false, error: `Contest not found for contestID="${contestID}"` });
      }
      return res.status(200).json({ success: true, record: updated });
    } catch (err) {
      console.error("[contests/[contestID] PATCH] Error =>", err);
      return res.status(500).json({ success: false, error: "Internal server error" });
    }
  }

  try {
    const { contests } = createRepositories();
    const contest = await contests.getByContestID(contestID);
    if (!contest) {
      return res.status(404).json({ success: false, error: `Contest not found for contestID="${contestID}"` });
    }
    return res.status(200).json({ success: true, contest });
  } catch (err) {
    console.error("[contests/[contestID]] Error =>", err);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
}
