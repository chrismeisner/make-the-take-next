// File: /pages/api/userPackProgress.js
import { getSession } from "next-auth/react";
import Airtable from "airtable";
import { getDataBackend } from "../../lib/runtimeConfig";
import { query } from "../../lib/db/postgres";

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
    const isPG = getDataBackend() === 'postgres';
    if (isPG) {
      // Resolve pack by external text pack_id or by id fallback
      const { rows: packsRows } = await query(
        `SELECT id FROM packs WHERE pack_id = $1 OR id::text = $1 LIMIT 1`,
        [packID]
      );
      if (packsRows.length === 0) {
        return res.status(404).json({ success: false, error: "Pack not found" });
      }
      const pgPackId = packsRows[0].id;
      // Count all props for this pack
      const { rows: propCountRows } = await query(
        `SELECT COUNT(*)::int AS c FROM props WHERE pack_id = $1`,
        [pgPackId]
      );
      const totalCount = propCountRows[0]?.c || 0;
      // Count user's latest takes for props belonging to this pack
      const { rows: completedRows } = await query(
        `SELECT COUNT(DISTINCT t.prop_id)::int AS c
           FROM takes t
           JOIN props p ON p.id = t.prop_id
          WHERE t.take_status = 'latest'
            AND t.take_mobile = $1
            AND p.pack_id = $2`,
        [session.user.phone, pgPackId]
      );
      const completedCount = completedRows[0]?.c || 0;
      return res.status(200).json({ success: true, completedCount, totalCount });
    }

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

    // Look up external propID values for the linked Prop records
    // so we can match Takes.propID (which stores the external ID, not the Airtable record ID)
    const propsFormula = `OR(${linkedPropIDs.map((id) => `RECORD_ID() = "${id}"`).join(", ")})`;
    const propRecords = await base("Props")
      .select({ filterByFormula: propsFormula, fields: ["propID"], maxRecords: 5000 })
      .all();
    const externalPropIDs = propRecords
      .map((rec) => rec.fields.propID)
      .filter(Boolean);
    console.log("Resolved external propIDs:", externalPropIDs);

    if (externalPropIDs.length === 0) {
      console.log("No external propIDs resolved; returning zero progress.");
      return res.status(200).json({ success: true, completedCount: 0, totalCount });
    }

    // Build an OR clause to query the Takes table by external propID values
    const orClauses = externalPropIDs.map((id) => `({propID} = "${id}")`).join(", ");
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
