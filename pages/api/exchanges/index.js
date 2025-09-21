import { getToken } from "next-auth/jwt";
import { sumTakePoints, isVisibleTake } from "../../../lib/points";
import { query } from "../../../lib/db/postgres";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res
      .status(405)
      .json({ success: false, error: "Method not allowed" });
  }

  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token || !token.profileID || !token.phone) {
      return res
        .status(401)
        .json({ success: false, error: "Unauthorized" });
    }

    const { itemID } = req.body || {};
    if (!itemID) {
      return res
        .status(400)
        .json({ success: false, error: "Missing itemID" });
    }

    {
      // Load item from Postgres
      const { rows: itemRows } = await query(
        'SELECT id, item_id, title, tokens, status FROM items WHERE item_id = $1 LIMIT 1',
        [itemID]
      );
      if (itemRows.length === 0) {
        return res.status(404).json({ success: false, error: 'Item not found' });
      }
      const row = itemRows[0];
      const itemTokens = Number(row.tokens) || 0;
      const itemStatus = row.status || '';
      if (itemStatus && itemStatus.toLowerCase() !== 'available') {
        return res.status(400).json({ success: false, error: `Item is not available (status: ${itemStatus})` });
      }
      if (!Number.isFinite(itemTokens) || itemTokens <= 0) {
        return res.status(400).json({ success: false, error: 'Invalid itemTokens on item' });
      }

      // Compute token balance from Postgres
      // Earned tokens from takes.tokens for latest takes
      const { rows: earnRows } = await query(
        `SELECT COALESCE(SUM(t.tokens),0) AS earned
           FROM takes t
           JOIN profiles p ON p.mobile_e164 = t.take_mobile
          WHERE p.profile_id = $1 AND t.take_status = 'latest'`,
        [token.profileID]
      );
      const tokensEarned = Number(earnRows[0]?.earned) || 0;
      // Spent tokens from exchanges
      const { rows: spentRows } = await query(
        `SELECT COALESCE(SUM(e.exchange_tokens),0) AS spent
           FROM exchanges e
           JOIN profiles p ON e.profile_id = p.id
          WHERE p.profile_id = $1`,
        [token.profileID]
      );
      const tokensSpent = Number(spentRows[0]?.spent) || 0;
      // Include awarded tokens
      const { rows: awardRows } = await query(
        `SELECT COALESCE(SUM(a.tokens),0) AS awarded
           FROM award_redemptions ar
           JOIN award_cards a ON a.id = ar.award_card_id
           JOIN profiles p ON p.id = ar.profile_id
          WHERE p.profile_id = $1`,
        [token.profileID]
      );
      const tokensAwarded = Number(awardRows[0]?.awarded) || 0;
      const availableBalance = tokensEarned + tokensAwarded - tokensSpent;
      if (availableBalance < itemTokens) {
        return res.status(400).json({ success: false, error: 'Insufficient tokens for this exchange', availableBalance, required: itemTokens });
      }

      // Create exchange record
      const { rows: profRows } = await query('SELECT id FROM profiles WHERE profile_id = $1 LIMIT 1', [token.profileID]);
      if (profRows.length === 0) {
        return res.status(404).json({ success: false, error: 'Profile not found' });
      }
      const profileRowId = profRows[0].id;
      const { rows: created } = await query(
        'INSERT INTO exchanges (profile_id, item_id, status, exchange_tokens) VALUES ($1,$2,$3,$4) RETURNING id',
        [profileRowId, row.id, 'requested', itemTokens]
      );
      return res.status(200).json({ success: true, exchangeID: created[0].id, exchangeTokens: itemTokens, itemID, balanceAfter: availableBalance - itemTokens });
    }
  } catch (err) {
    console.error("[/api/exchanges] Error:", err);
    return res
      .status(500)
      .json({ success: false, error: "Server error creating exchange" });
  }
}


