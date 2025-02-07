// File: pages/api/take.js
import { getToken } from "next-auth/jwt";
import { createTake } from "../../lib/airtableService";

export default async function handler(req, res) {
  console.log("[/api/take] Received request with method:", req.method);

  // Only allow POST requests
  if (req.method !== "POST") {
	console.error("[/api/take] Invalid method:", req.method);
	return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  // Get the JWT token from the request
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  console.log("[/api/take] getToken returned:", token);

  if (!token || !token.phone) {
	console.error("[/api/take] No valid token found or phone missing. Unauthorized.");
	return res.status(401).json({ success: false, error: "Unauthorized" });
  }

  // Get propID & propSide from the request body
  const { propID, propSide } = req.body;
  console.log("[/api/take] Request body:", req.body);

  // Check for missing propID or propSide
  if (!propID || !propSide) {
	console.error("[/api/take] Missing propID or propSide in request.");
	return res.status(400).json({ success: false, error: "Missing propID or propSide" });
  }

  console.log(
	"[/api/take] Proceeding with token.phone:",
	token.phone,
	"propID:",
	propID,
	"propSide:",
	propSide
  );

  try {
	// Call the createTake function with the relevant parameters
	console.log("[/api/take] Calling createTake with parameters:", {
	  propID,
	  propSide,
	  phone: token.phone,
	});
	const result = await createTake({
	  propID,
	  propSide,
	  phone: token.phone,
	});

	console.log("[/api/take] createTake returned:", result);
	return res.status(200).json({ success: true, ...result });
  } catch (err) {
	console.error("[/api/take] Exception occurred:", err);
	// Return a generic error message with the exception message
	return res.status(500).json({ success: false, error: err.message || "Error creating take" });
  }
}
