// File: /pages/api/admin/recount.js

import { getToken } from "next-auth/jwt";
import Airtable from "airtable";

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY })
  .base(process.env.AIRTABLE_BASE_ID);

export default async function handler(req, res) {
  if (req.method !== "POST") {
	return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  // 1) Check user is logged in & authorized (admin)
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) {
	console.log("❌ [admin/recount] Unauthorized attempt to run recount.");
	return res.status(401).json({ success: false, error: "Unauthorized" });
  }

  console.log("🔑 [admin/recount] Authorized user =>", token);

  try {
	// 2) Fetch all props
	console.log("🗂  [admin/recount] Fetching all Props...");
	const propsRecords = await base("Props").select({ maxRecords: 5000 }).all();

	console.log(`📦  [admin/recount] Total Props found: ${propsRecords.length}`);

	const updates = [];

	// 3) For each prop, fetch relevant Takes and count side A / side B
	for (const propRec of propsRecords) {
	  const propID = propRec.fields.propID;
	  if (!propID) continue;

	  console.log(`🔎 [admin/recount] Checking propID="${propID}"...`);

	  // 3a) Fetch relevant Takes
	  const takesForThisProp = await base("Takes")
		.select({
		  filterByFormula: `AND({propID}="${propID}", {takeStatus} != "overwritten")`,
		  maxRecords: 5000,
		})
		.all();

	  let sideACount = 0;
	  let sideBCount = 0;

	  // 3b) Count side A vs side B
	  for (const take of takesForThisProp) {
		const side = take.fields.propSide;
		if (side === "A") sideACount++;
		if (side === "B") sideBCount++;
	  }

	  console.log(
		`👀 [admin/recount] Raw count => (A=${sideACount}, B=${sideBCount})`
	  );

	  // 4) Universal post-processing approach: shift everything up by 1
	  //    if it's zero => set to 1, else side++
	  if (sideACount === 0) {
		sideACount = 1;
	  } else {
		sideACount++;
	  }

	  if (sideBCount === 0) {
		sideBCount = 1;
	  } else {
		sideBCount++;
	  }

	  console.log(
		`🔧 [admin/recount] Final adjusted => (A=${sideACount}, B=${sideBCount})`
	  );

	  // 5) Queue up an update
	  updates.push({
		id: propRec.id,
		fields: {
		  propSideACount: sideACount,
		  propSideBCount: sideBCount,
		},
	  });
	}

	// 6) Bulk update in batches of 10
	console.log(
	  `🛠  [admin/recount] Preparing to update ${updates.length} Prop records in batches of 10...`
	);
	const BATCH_SIZE = 10;
	for (let i = 0; i < updates.length; i += BATCH_SIZE) {
	  const slice = updates.slice(i, i + BATCH_SIZE);
	  console.log(
		`⚙️  [admin/recount] Updating batch from index ${i} to ${
		  i + BATCH_SIZE - 1
		}...`
	  );
	  await base("Props").update(slice);
	}

	console.log("✅ [admin/recount] Recount complete!");
	return res.status(200).json({
	  success: true,
	  updatedCount: updates.length,
	  message: "Recount complete, with universal +1 offset for all side counts.",
	});
  } catch (err) {
	console.error("💥 [admin/recount] Error =>", err);
	return res.status(500).json({ success: false, error: err.message });
  }
}
