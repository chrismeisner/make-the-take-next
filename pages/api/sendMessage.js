// File: /pages/api/sendMessage.js
import Airtable from "airtable";
import { sendSMS } from "../../lib/twilioService";

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY })
  .base(process.env.AIRTABLE_BASE_ID);

export default async function handler(req, res) {
  console.log("📤 [sendMessage] Request received with method:", req.method);
  if (req.method !== "POST") {
	console.error("🚫 [sendMessage] Method not allowed:", req.method);
	return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  const { phone, team } = req.body;
  console.log("📨 [sendMessage] Received phone and team:", phone, team);
  if (!phone || !team) {
	console.error("🚫 [sendMessage] Missing phone or team in request body");
	return res.status(400).json({ success: false, error: "Missing phone or team" });
  }

  try {
	// Query the Teams table for the team record using team name to get teamEmoji.
	console.log("🔍 [sendMessage] Querying Teams table for team:", team);
	const teamRecords = await base("Teams").select({
	  filterByFormula: `{teamName} = "${team}"`,
	  maxRecords: 1,
	}).firstPage();

	let teamDisplay = team;
	if (teamRecords.length > 0) {
	  const teamEmoji = teamRecords[0].fields.teamEmoji || "";
	  teamDisplay = teamEmoji ? `${teamEmoji} ${team}` : team;
	  console.log("✅ [sendMessage] Found team emoji:", teamEmoji);
	} else {
	  console.warn("⚠️ [sendMessage] No team record found for team:", team);
	}

	// Query the Messages table for the "new user sign up" message
	console.log("🔍 [sendMessage] Querying Messages table for event 'new user sign up'");
	const records = await base("Messages").select({
	  filterByFormula: `{messageEvent} = "new user sign up"`
	}).firstPage();

	if (records.length === 0) {
	  console.error("🚫 [sendMessage] No message found for 'new user sign up'");
	  return res.status(404).json({
		success: false,
		error: "No message found for new user sign up"
	  });
	}

	let messageTemplate = records[0].fields.messageBody || "";
	// Replace [TEAM NAME] placeholder with the actual team display text
	const messageBody = messageTemplate.replace("[TEAM NAME]", teamDisplay);
	console.log("💬 [sendMessage] Final message body:", messageBody);

	// Send SMS using the sendSMS function from twilioService
	const smsResponse = await sendSMS({ to: phone, message: messageBody });
	console.log("✅ [sendMessage] SMS sent successfully:", smsResponse);
	return res.status(200).json({ success: true, smsResponse });
  } catch (err) {
	console.error("💥 [sendMessage] Error:", err);
	return res.status(500).json({ success: false, error: "Server error sending message" });
  }
}
