import { getSession } from "next-auth/react";
import Airtable from "airtable";

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY })
  .base(process.env.AIRTABLE_BASE_ID);

export default async function handler(req, res) {
  if (req.method !== "GET") {
	return res
	  .status(405)
	  .json({ success: false, error: "Method not allowed" });
  }
  
  // Support fetching by propID if provided; otherwise, return all takes for the user.
  const { propID } = req.query;
  const session = await getSession({ req });
  if (!session?.user?.phone) {
	return res.status(401).json({ success: false, error: "Unauthorized" });
  }

  try {
	let filterFormula;
	if (propID) {
	  // Fetch take for a specific prop.
	  filterFormula = `AND({propID} = "${propID}", {takeMobile} = "${session.user.phone}", {takeStatus} = "latest")`;
	} else {
	  // Otherwise, fetch all takes for the user.
	  filterFormula = `AND({takeMobile} = "${session.user.phone}", {takeStatus} = "latest")`;
	}
	
	const records = await base("Takes")
	  .select({ filterByFormula: filterFormula, maxRecords: 5000 })
	  .all();

    // Branch for single propID to match VerificationWidget expectations
    if (propID) {
      if (records.length === 0) {
        return res.status(200).json({ success: true });
      }
      const record = records[0];
      const f = record.fields;
      return res.status(200).json({
        success: true,
        side: f.propSide,
        takeID: f.TakeID || record.id,
      });
    }
	
	if (records.length === 0) {
	  return res.status(200).json({ success: true, takes: [] });
	}
	
	const takes = records.map((record) => {
	  const f = record.fields;
	  return {
		takeID: f.TakeID || record.id,
		propID: f.propID || null,
		takeMobile: f.takeMobile || null,
		takeStatus: f.takeStatus || null,
		takeResult: f.takeResult || null,
		packs: f.Packs || [], // expecting this field to be an array of pack IDs
	  };
	});
	
	return res.status(200).json({ success: true, takes });
  } catch (error) {
	console.error("[userTakes] Error fetching user takes:", error);
	return res
	  .status(500)
	  .json({ success: false, error: "Error fetching user takes" });
  }
}
