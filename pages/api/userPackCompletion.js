// File: /pages/api/userPackCompletion.js
import { getSession } from "next-auth/react";
import Airtable from "airtable";

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(
  process.env.AIRTABLE_BASE_ID
);

export default async function handler(req, res) {
  // Only allow GET requests
  if (req.method !== "GET") {
	return res
	  .status(405)
	  .json({ success: false, error: "Method not allowed" });
  }

  // Get the user's session
  const session = await getSession({ req });
  if (!session?.user || !session.user.phone) {
	return res
	  .status(401)
	  .json({ success: false, error: "Unauthorized" });
  }

  // Get the packID from query parameters
  const { packID } = req.query;
  if (!packID) {
	return res
	  .status(400)
	  .json({ success: false, error: "Missing packID parameter" });
  }

  try {
	// 1. Fetch the pack record by packID from the Packs table
	const packRecords = await base("Packs")
	  .select({
		filterByFormula: `{packID} = "${packID}"`,
		maxRecords: 1,
	  })
	  .firstPage();

	if (!packRecords || packRecords.length === 0) {
	  return res
		.status(404)
		.json({ success: false, error: "Pack not found" });
	}

	const packRecord = packRecords[0];
	const packFields = packRecord.fields;
	// Assume linked Prop IDs are stored in the "Props" field
	const linkedPropIDs = packFields.Props || [];

	// If there are no props linked to the pack, then it's incomplete.
	if (linkedPropIDs.length === 0) {
	  return res.status(200).json({ success: true, completed: false });
	}

	// 2. Build an OR clause to query the Takes table for these propIDs
	const orClauses = linkedPropIDs
	  .map((id) => `({propID} = "${id}")`)
	  .join(", ");
	const formula = `AND(
	  {takeMobile} = "${session.user.phone}",
	  {takeStatus} = "latest",
	  OR(${orClauses})
	)`;

	// 3. Query the Takes table
	const takesRecords = await base("Takes")
	  .select({
		filterByFormula: formula,
		maxRecords: 5000,
	  })
	  .all();

	// 4. Collect the unique propIDs for which the user has a take.
	const userPropIDs = new Set();
	takesRecords.forEach((record) => {
	  const f = record.fields;
	  if (f.propID) {
		userPropIDs.add(f.propID);
	  }
	});

	// 5. If the number of unique takes matches the number of props in the pack, it's complete.
	const completed = userPropIDs.size === linkedPropIDs.length;

	return res.status(200).json({ success: true, completed });
  } catch (error) {
	console.error("[userPackCompletion API] Error:", error);
	return res.status(500).json({
	  success: false,
	  error: "Internal server error",
	});
  }
}
