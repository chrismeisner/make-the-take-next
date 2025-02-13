// File: /pages/api/userPoints.js
import { getSession } from "next-auth/react";
import Airtable from "airtable";

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY })
  .base(process.env.AIRTABLE_BASE_ID);

/**
 * Sums up takePTS for the logged-in user from the "Takes" table,
 * ignoring overwritten takes, or specifically "latest" if that's your usage.
 */
export default async function handler(req, res) {
  if (req.method !== "GET") {
	return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  const session = await getSession({ req });
  if (!session?.user?.phone) {
	return res.status(401).json({ success: false, error: "Unauthorized" });
  }

  try {
	// 1) Find all non-overwritten (or "latest") takes for this user
	// If you specifically want "takeStatus = latest", use that. Otherwise,
	// you might do filterByFormula: `AND({takeMobile} = "xxx", {takeStatus} != "overwritten")`
	const phone = session.user.phone;
	const takeRecords = await base("Takes")
	  .select({
		maxRecords: 5000,
		filterByFormula: `AND({takeMobile} = "${phone}", {takeStatus} = "latest")`,
	  })
	  .all();

	// 2) Sum up takePTS
	let totalPoints = 0;
	takeRecords.forEach((rec) => {
	  const pts = rec.fields.takePTS || 0;
	  totalPoints += pts;
	});

	return res.status(200).json({ success: true, totalPoints });
  } catch (err) {
	console.error("[userPoints] error =>", err);
	return res.status(500).json({ success: false, error: "Server error" });
  }
}
