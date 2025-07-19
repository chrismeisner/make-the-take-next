// File: /pages/api/admin/recount.js

import { getToken } from "next-auth/jwt";
import Airtable from "airtable";

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY })
  .base(process.env.AIRTABLE_BASE_ID);

export default async function handler(req, res) {
  if (req.method !== "POST") {
	return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  // Recount disabled: dynamic side counts are computed from the Takes table.
  return res.status(200).json({
    success: true,
    message: "Recount disabled; dynamic side counts in use",
  });
}
