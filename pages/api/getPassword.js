// File: /pages/api/getPassword.js
import Airtable from "airtable";

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY })
  .base(process.env.AIRTABLE_BASE_ID);

export default async function handler(req, res) {
  if (req.method !== "GET") {
	return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  const { passwordID } = req.query;
  if (!passwordID) {
	return res.status(400).json({ success: false, error: "Missing passwordID" });
  }

  try {
	// NOTE: changed from base("Password") to base("Passwords")
	const records = await base("Passwords")
	  .select({
		filterByFormula: `{passwordID} = "${passwordID}"`,
		maxRecords: 1,
	  })
	  .firstPage();

	if (records.length === 0) {
	  return res.status(404).json({ success: false, error: "Password not found" });
	}

	const record = records[0];
	const fields = record.fields;
	const realPassword = fields.password || "";

	return res.status(200).json({ success: true, password: realPassword });
  } catch (err) {
	console.error("[getPassword] Error =>", err);
	return res
	  .status(500)
	  .json({ success: false, error: "Internal server error" });
  }
}
