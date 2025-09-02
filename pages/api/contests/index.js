// File: /pages/api/contests/index.js

import { createRepositories } from '../../../lib/dal/factory';

export default async function handler(req, res) {
  if (req.method === "POST") {
    // Create a new contest
    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const {
        contestTitle,
        contestSummary,
        contestPrize,
        contestStatus = "draft",
        contestStartTime,
        contestEndTime,
        packURLs = [],
        contestCoverUrl,
      } = body || {};

      if (!contestTitle) {
        return res.status(400).json({ success: false, error: "contestTitle is required" });
      }

      const { contests } = createRepositories();
      const contestID = body.contestID || contestTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      const created = await contests.createOne({
        contestID,
        contestTitle,
        contestSummary,
        contestPrize,
        contestStatus,
        contestStartTime,
        contestEndTime,
        packURLs,
        contestCoverUrl,
      });
      if (packURLs?.length) {
        await contests.linkPacks(contestID, packURLs);
      }
      return res.status(200).json({ success: true, contest: created });
    } catch (err) {
      console.error("[api/contests] POST error =>", err);
      return res.status(500).json({ success: false, error: "Failed to create contest" });
    }
  }

  if (req.method !== "GET") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  try {
    const { contests } = createRepositories();
    const data = await contests.listAll();
    return res.status(200).json({ success: true, contests: data });
  } catch (err) {
    console.error("[api/contests] error =>", err);
    return res.status(500).json({
      success: false,
      error: "Failed to fetch contests.",
    });
  }
}
