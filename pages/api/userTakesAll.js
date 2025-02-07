// pages/api/userTakesAll.js
import { getSession } from "next-auth/react";
import Airtable from "airtable";

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY })
  .base(process.env.AIRTABLE_BASE_ID);

export default async function handler(req, res) {
  if (req.method !== "GET") {
	return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  const session = await getSession({ req });
  if (!session?.user?.phone) {
	return res.status(401).json({ success: false, error: "Unauthorized" });
  }

  try {
	// Fetch all takes for this user that aren't overwritten
	const records = await base("Takes")
	  .select({
		filterByFormula: `AND({takeMobile} = "${session.user.phone}", {takeStatus} != "overwritten")`,
		maxRecords: 5000,
	  })
	  .all();

	// Map them to an array of { propID, side }
	const userTakes = records.map((r) => ({
	  propID: r.fields.propID,
	  side: r.fields.propSide,
	}));

	return res.status(200).json({
	  success: true,
	  userTakes,
	});
  } catch (error) {
	console.error("[userTakesAll] Error fetching user takes:", error);
	return res.status(500).json({ success: false, error: "Error fetching user takes" });
  }
}
