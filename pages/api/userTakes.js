// pages/api/userTakes.js
import { getSession } from "next-auth/react";
import Airtable from "airtable";

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY })
  .base(process.env.AIRTABLE_BASE_ID);

export default async function handler(req, res) {
  if (req.method !== "GET") {
	return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  const { propID } = req.query;
  const session = await getSession({ req });
  if (!session?.user?.phone) {
	return res.status(401).json({ success: false, error: "Unauthorized" });
  }

  try {
	const filterFormula = `AND({propID} = "${propID}", {takeMobile} = "${session.user.phone}")`;
	const records = await base("Takes")
	  .select({ filterByFormula: filterFormula, maxRecords: 1 })
	  .firstPage();

	if (records.length === 0) {
	  return res.status(200).json({ success: true, side: null, message: "No existing take" });
	}

	const take = records[0].fields;
	return res.status(200).json({
	  success: true,
	  side: take.propSide || null,
	});
  } catch (error) {
	console.error("[userTakes] Error fetching user take:", error);
	return res.status(500).json({ success: false, error: "Error fetching user takes" });
  }
}
