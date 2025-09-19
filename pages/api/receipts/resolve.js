import { query } from "../../../lib/db/postgres";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  const { packURL, profileID } = req.query;
  if (!packURL || !profileID) {
    return res.status(400).json({ success: false, error: "Missing packURL or profileID" });
  }

  try {
    console.log(`[receipts/resolve] Starting resolve for packURL=${packURL}, profileID=${profileID}`);
    
    // 1) Resolve pack ID from pack URL
    const { rows: packRows } = await query('SELECT id FROM packs WHERE pack_url = $1 LIMIT 1', [packURL]);
    const packId = packRows?.[0]?.id || null;
    if (!packId) {
      console.log(`[receipts/resolve] Pack not found for packURL=${packURL}`);
      return res.status(404).json({ success: false, error: "Pack not found" });
    }
    console.log(`[receipts/resolve] Found pack ID: ${packId}`);

    // 2) Resolve profile to get mobile (preferred for Takes lookups)
    let mobile = null;
    const { rows: profileRows } = await query('SELECT mobile_e164 FROM profiles WHERE profile_id = $1 LIMIT 1', [profileID]);
    if (profileRows.length > 0) {
      mobile = profileRows[0].mobile_e164;
      console.log(`[receipts/resolve] Found mobile for profileID=${profileID}: ${mobile}`);
    } else {
      console.log(`[receipts/resolve] No mobile found for profileID=${profileID}`);
    }

    // 3) Query takes for this pack and user
    let takeRows;
    if (mobile) {
      // Query by mobile if available
      takeRows = await query(`
        SELECT t.id, t.created_at
        FROM takes t
        JOIN props p ON p.id = t.prop_id
        WHERE p.pack_id = $1 AND t.take_mobile = $2 AND t.take_status = 'latest'
        ORDER BY t.created_at DESC
      `, [packId, mobile]);
    } else {
      // Fallback to profileID lookup via profiles table
      takeRows = await query(`
        SELECT t.id, t.created_at
        FROM takes t
        JOIN props p ON p.id = t.prop_id
        JOIN profiles pr ON pr.mobile_e164 = t.take_mobile
        WHERE p.pack_id = $1 AND pr.profile_id = $2 AND t.take_status = 'latest'
        ORDER BY t.created_at DESC
      `, [packId, profileID]);
    }

    console.log(`[receipts/resolve] Found ${takeRows.rows.length} take records`);
    if (takeRows.rows.length === 0) {
      console.log(`[receipts/resolve] No takes found for user on this pack`);
      return res.status(404).json({ success: false, error: "No takes found for user on this pack" });
    }

    // 4) Since Postgres doesn't have receipt_id, we'll use the most recent take's ID as the "receipt ID"
    // In the future, this could be enhanced to group takes by timestamp windows
    const mostRecentTake = takeRows.rows[0];
    const receiptId = mostRecentTake.id;

    console.log(`[receipts/resolve] Found latest receipt ID: ${receiptId}`);
    return res.status(200).json({ success: true, receiptId });
  } catch (err) {
    console.error('[api/receipts/resolve] Error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}


