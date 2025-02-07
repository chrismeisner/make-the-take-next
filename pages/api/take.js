// File: pages/api/take.js
import { getToken } from "next-auth/jwt";
import { createTake } from "../../lib/airtableService";

export default async function handler(req, res) {
  console.log("[/api/take] Received request with method:", req.method);

  if (req.method !== "POST") {
	console.error("[/api/take] Invalid method:", req.method);
	return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  // Instead of getSession, we now use getToken to explicitly extract the JWT.
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  console.log("[/api/take] getToken returned:", token);

  if (!token || !token.phone) {
	console.error("[/api/take] No valid token found or phone missing. Unauthorized.");
	return res.status(401).json({ success: false, error: "Unauthorized" });
  }

  // Get propID & side from the request body
  const { propID, propSide } = req.body;
  console.log("[/api/take] Request body:", req.body);
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
	return res
	  .status(500)
	  .json({ success: false, error: err.message || "Error creating take" });
  }
}
