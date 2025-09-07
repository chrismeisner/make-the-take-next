// pages/api/userTakesAll.js
import { getSession } from "next-auth/react";
import Airtable from "airtable";
import { getDataBackend } from "../../lib/runtimeConfig";
import { query } from "../../lib/db/postgres";

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
	// Postgres path: mirror Airtable response shape
	if (getDataBackend() === 'postgres') {
	  const phone = session.user.phone;
	  const { rows } = await query(
		`SELECT id, prop_id_text, prop_side
		   FROM takes
		  WHERE take_mobile = $1
		    AND take_status != 'overwritten'
		  ORDER BY created_at ASC
		  LIMIT 5000`,
		[phone]
	  );
	  const userTakes = rows.map((r) => ({
		propID: r.prop_id_text,
		side: r.prop_side,
		takeID: r.id,
	  }));
	  return res.status(200).json({ success: true, userTakes });
	}

	// Fetch all takes for this user that aren't overwritten (Airtable)
	const records = await base("Takes")
	  .select({
		filterByFormula: `AND({takeMobile} = "${session.user.phone}", {takeStatus} != "overwritten")`,
		maxRecords: 5000,
	  })
	  .all();

	// Map each record to include: propID, side, and takeID (using TakeID field or the record id)
	const userTakes = records.map((r) => ({
	  propID: r.fields.propID,
	  side: r.fields.propSide,
	  takeID: r.fields.TakeID || r.id,
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
