// pages/api/teams.js

import { createRepositories } from "../../lib/dal/factory";

export default async function handler(req, res) {
  if (req.method !== "GET") {
	return res.status(405).json({ success: false, error: "Method not allowed" });
  }
  
  try {
    const { teams } = createRepositories();
    const rows = await teams.listAll();
    return res.status(200).json({ success: true, teams: rows });
  } catch (err) {
	console.error("[/api/teams] error =>", err);
	return res.status(500).json({ success: false, error: "Server error fetching teams" });
  }
}
