import { getServerSession } from 'next-auth/next';
import { authOptions } from './auth/[...nextauth]';
import { getDataBackend } from '../../../lib/runtimeConfig';
import { query } from '../../../lib/db/postgres';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session?.user) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }

  const {
    fullName,
    email,
    phone,
    address,
    city,
    state,
    zipCode,
    country,
    specialInstructions,
    itemID,
    profileID
  } = req.body;

  // Validate required fields
  if (!fullName || !email || !phone || !address || !city || !state || !zipCode || !country || !itemID) {
    return res.status(400).json({ 
      success: false, 
      error: 'Missing required fields' 
    });
  }

  try {
    const backend = getDataBackend();
    
    if (backend === 'postgres') {
      // Start a transaction to ensure data consistency
      await query('BEGIN');

      try {
        // 1. Verify the item exists and is available
        const { rows: itemRows } = await query(
          'SELECT id, item_id, title, tokens, status FROM items WHERE item_id = $1 LIMIT 1',
          [itemID]
        );

        if (itemRows.length === 0) {
          await query('ROLLBACK');
          return res.status(404).json({ success: false, error: 'Item not found' });
        }

        const item = itemRows[0];
        const itemTokens = Number(item.tokens) || 0;
        const itemStatus = item.status || '';

        if (itemStatus.toLowerCase() !== 'available') {
          await query('ROLLBACK');
          return res.status(400).json({ 
            success: false, 
            error: `Item is not available (status: ${itemStatus})` 
          });
        }

        if (!Number.isFinite(itemTokens) || itemTokens <= 0) {
          await query('ROLLBACK');
          return res.status(400).json({ 
            success: false, 
            error: 'Invalid item cost' 
          });
        }

        // 2. Get user's profile ID from session
        const userProfileID = session.user.profileID;
        if (!userProfileID) {
          await query('ROLLBACK');
          return res.status(400).json({ 
            success: false, 
            error: 'User profile not found' 
          });
        }

        // 3. Calculate user's token balance
        // Earned tokens from takes.tokens for latest takes
        const { rows: earnRows } = await query(
          `SELECT COALESCE(SUM(t.tokens),0) AS earned
             FROM takes t
             JOIN profiles p ON p.mobile_e164 = t.take_mobile
            WHERE p.profile_id = $1 AND t.take_status = 'latest'`,
          [userProfileID]
        );
        const tokensEarned = Number(earnRows[0]?.earned) || 0;

        // Spent tokens from exchanges
        const { rows: spentRows } = await query(
          `SELECT COALESCE(SUM(e.exchange_tokens),0) AS spent
             FROM exchanges e
             JOIN profiles p ON e.profile_id = p.id
            WHERE p.profile_id = $1`,
          [userProfileID]
        );
        const tokensSpent = Number(spentRows[0]?.spent) || 0;
        const availableBalance = tokensEarned - tokensSpent;

        // 4. Check if user has enough tokens
        if (availableBalance < itemTokens) {
          await query('ROLLBACK');
          return res.status(400).json({ 
            success: false, 
            error: `Insufficient tokens. Required: ${itemTokens}, Available: ${availableBalance}` 
          });
        }

        // 5. Get profile UUID for foreign key
        const { rows: profileRows } = await query(
          'SELECT id FROM profiles WHERE profile_id = $1 LIMIT 1',
          [userProfileID]
        );
        if (profileRows.length === 0) {
          await query('ROLLBACK');
          return res.status(404).json({ 
            success: false, 
            error: 'Profile not found' 
          });
        }
        const profileUUID = profileRows[0].id;

        // 6. Create exchange record
        const { rows: exchangeRows } = await query(
          `INSERT INTO exchanges (profile_id, item_id, exchange_tokens, status)
           VALUES ($1, $2, $3, 'pending')
           RETURNING id`,
          [profileUUID, item.id, itemTokens]
        );
        const exchangeId = exchangeRows[0].id;

        // 7. Create redemption record with detailed information
        const { rows: redemptionRows } = await query(
          `INSERT INTO redemptions (
            profile_id, item_id, exchange_id, full_name, email, phone,
            address, city, state, zip_code, country, special_instructions,
            status
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'pending')
           RETURNING id`,
          [
            profileUUID, item.id, exchangeId, fullName, email, phone,
            address, city, state, zipCode, country, specialInstructions || null
          ]
        );
        const redemptionId = redemptionRows[0].id;

        // 8. Update exchange status to 'completed'
        await query(
          'UPDATE exchanges SET status = $1 WHERE id = $2',
          ['completed', exchangeId]
        );

        // Commit the transaction
        await query('COMMIT');

        // 9. Log the successful redemption
        console.log('Redemption created successfully:', {
          redemptionId,
          exchangeId,
          profileID: userProfileID,
          itemID,
          itemName: item.title,
          tokensSpent: itemTokens,
          newBalance: availableBalance - itemTokens
        });

        res.status(200).json({
          success: true,
          message: 'Redemption request submitted successfully',
          redemptionID: redemptionId,
          exchangeID: exchangeId,
          tokensSpent: itemTokens,
          remainingBalance: availableBalance - itemTokens
        });

      } catch (error) {
        await query('ROLLBACK');
        throw error;
      }

    } else {
      // Non-Postgres backend (Airtable, etc.)
      return res.status(501).json({ 
        success: false, 
        error: 'Non-Postgres backends not implemented for redemptions' 
      });
    }

  } catch (error) {
    console.error('Error processing redemption request:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}
