// File: /pages/api/userPackProgress.js
import { getSession } from "next-auth/react";
import Airtable from "airtable";

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(
  process.env.AIRTABLE_BASE_ID
);

export default async function handler(req, res) {
  if (req.method !== "GET") {
	console.log("Method not allowed:", req.method);
	return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  // Get user session and verify that the user is logged in.
  const session = await getSession({ req });
  if (!session?.user || !session.user.phone) {
	console.log("Unauthorized: No session or phone number found.");
	return res.status(401).json({ success: false, error: "Unauthorized" });
  }

  const { packID } = req.query;
  if (!packID) {
	console.log("Missing packID parameter.");
	return res.status(400).json({ success: false, error: "Missing packID parameter" });
  }

  try {
	console.log("Fetching pack record for packID:", packID);
	const packRecords = await base("Packs")
	  .select({
		filterByFormula: `{packID} = "${packID}"`,
		maxRecords: 1,
	  })
	  .firstPage();

	if (!packRecords || packRecords.length === 0) {
	  console.log("Pack not found for packID:", packID);
	  return res.status(404).json({ success: false, error: "Pack not found" });
	}

	const packRecord = packRecords[0];
	const packFields = packRecord.fields;
	const linkedPropIDs = packFields.Props || [];
	const totalCount = linkedPropIDs.length;
	console.log("Total props in pack:", totalCount, "Linked Prop IDs:", linkedPropIDs);

	if (totalCount === 0) {
	  console.log("No props linked to this pack.");
	  return res.status(200).json({ success: true, completedCount: 0, totalCount: 0 });
	}

	// Build an OR clause to query the Takes table.
	const orClauses = linkedPropIDs
	  .map((id) => `({propID} = "${id}")`)
	  .join(", ");
	const formula = `AND(
	  {takeMobile} = "${session.user.phone}",
	  {takeStatus} = "latest",
	  OR(${orClauses})
	)`;
	console.log("Constructed Takes query formula:", formula);

	const takesRecords = await base("Takes")
	  .select({
		filterByFormula: formula,
		maxRecords: 5000,
	  })
	  .all();
	console.log("Number of takes records found:", takesRecords.length);

	const userPropIDs = new Set();
	takesRecords.forEach((record) => {
	  const f = record.fields;
	  if (f.propID) {
		userPropIDs.add(f.propID);
	  }
	});
	const completedCount = userPropIDs.size;
	console.log("User's completed Prop IDs:", [...userPropIDs]);
	console.log("Completed count:", completedCount);

	return res.status(200).json({ success: true, completedCount, totalCount });
  } catch (error) {
	console.error("Error in userPackProgress API:", error);
	return res.status(500).json({ success: false, error: "Internal server error" });
  }
}
