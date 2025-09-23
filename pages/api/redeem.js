import { getServerSession } from 'next-auth/next';
import { authOptions } from './auth/[...nextauth]';
import { getDataBackend } from '../../lib/runtimeConfig';
import { query } from '../../lib/db/postgres';
import { sendEmail } from '../../lib/emailService';

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

  // Correlation ID for tracing end-to-end
  const headerCorrelation = String(req.headers['x-correlation-id'] || '').trim();
  const bodyCorrelation = req.body && req.body.correlationId ? String(req.body.correlationId).trim() : '';
  const correlationId = headerCorrelation || bodyCorrelation || `redeem_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

  // Validate minimal required fields upfront
  if (!email || !itemID) {
    return res.status(400).json({
      success: false,
      error: 'Missing required fields',
    });
  }

  try {
    const backend = getDataBackend();
    
    if (backend === 'postgres') {
      try {
        console.log('[redeem] api:start', {
          correlationId,
          itemID,
          user: { profileID: session?.user?.profileID, phone: session?.user?.phone, email },
          ua: req.headers['user-agent'] || '',
          ip: req.headers['x-forwarded-for'] || req.socket?.remoteAddress || ''
        });
      } catch {}
      // Ensure schema compatibility (safe no-op if column already exists)
      await query(
        `ALTER TABLE redemptions 
           ADD COLUMN IF NOT EXISTS item_code_id UUID 
           REFERENCES item_codes(id) ON DELETE SET NULL`
      );

      // Start a transaction to ensure data consistency
      await query('BEGIN');

      try {
        // 1. Verify the item exists and is available
        try { console.log('[redeem] db:items:select', { correlationId, itemID }); } catch {}
        const { rows: itemRows } = await query(
          'SELECT id, item_id, title, tokens, status FROM items WHERE item_id = $1 LIMIT 1',
          [itemID]
        );

        if (itemRows.length === 0) {
          await query('ROLLBACK');
          try { console.warn('[redeem] db:items:not_found', { correlationId, itemID }); } catch {}
          return res.status(404).json({ success: false, error: 'Item not found', correlationId });
        }

        const item = itemRows[0];
        const itemTokens = Number(item.tokens) || 0;
        const itemStatus = item.status || '';

        if (itemStatus.toLowerCase() !== 'available') {
          await query('ROLLBACK');
          return res.status(400).json({ 
            success: false, 
            error: `Item is not available (status: ${itemStatus})`,
            correlationId
          });
        }

        if (!Number.isFinite(itemTokens) || itemTokens <= 0) {
          await query('ROLLBACK');
          return res.status(400).json({ 
            success: false, 
            error: 'Invalid item cost',
            correlationId
          });
        }

        // 1b. If item requires address, ensure required shipping fields are present
        const { rows: requireRows } = await query(
          'SELECT require_address FROM items WHERE id = $1 LIMIT 1',
          [item.id]
        );
        const requireAddress = Boolean(requireRows[0]?.require_address);
        if (requireAddress) {
          if (!fullName || !phone || !address || !city || !state || !zipCode || !country) {
            await query('ROLLBACK');
            return res.status(400).json({
              success: false,
              error: 'Missing required shipping fields',
              correlationId,
            });
          }
        }

        // 2. Get user's profile ID from session
        const userProfileID = session.user.profileID;
        if (!userProfileID) {
          await query('ROLLBACK');
          return res.status(400).json({ 
            success: false, 
            error: 'User profile not found',
            correlationId
          });
        }

        // 3. Calculate user's token balance
        // Earned tokens from takes.tokens for latest takes
        try { console.log('[redeem] db:balance:earned:select', { correlationId, profileID: userProfileID }); } catch {}
        const { rows: earnRows } = await query(
          `SELECT COALESCE(SUM(t.tokens),0) AS earned
             FROM takes t
             JOIN profiles p ON p.mobile_e164 = t.take_mobile
            WHERE p.profile_id = $1 AND t.take_status = 'latest'`,
          [userProfileID]
        );
        const tokensEarned = Number(earnRows[0]?.earned) || 0;

        // Spent tokens from exchanges
        try { console.log('[redeem] db:balance:spent:select', { correlationId, profileID: userProfileID }); } catch {}
        const { rows: spentRows } = await query(
          `SELECT COALESCE(SUM(e.exchange_tokens),0) AS spent
             FROM exchanges e
             JOIN profiles p ON e.profile_id = p.id
            WHERE p.profile_id = $1`,
          [userProfileID]
        );
        const tokensSpent = Number(spentRows[0]?.spent) || 0;
        const availableBalance = tokensEarned - tokensSpent;
        try { console.log('[redeem] tokens:balance', { correlationId, tokensEarned, tokensSpent, availableBalance, itemTokens }); } catch {}

        // 4. Check if user has enough tokens
        if (availableBalance < itemTokens) {
          await query('ROLLBACK');
          return res.status(400).json({ 
            success: false, 
            error: `Insufficient tokens. Required: ${itemTokens}, Available: ${availableBalance}`,
            correlationId
          });
        }

        // 5. Get profile UUID for foreign key
        try { console.log('[redeem] db:profiles:select', { correlationId, profileID: userProfileID }); } catch {}
        const { rows: profileRows } = await query(
          'SELECT id FROM profiles WHERE profile_id = $1 LIMIT 1',
          [userProfileID]
        );
        if (profileRows.length === 0) {
          await query('ROLLBACK');
          return res.status(404).json({ 
            success: false, 
            error: 'Profile not found',
            correlationId
          });
        }
        const profileUUID = profileRows[0].id;

        // 6. Create exchange record
        try { console.log('[redeem] db:exchanges:insert', { correlationId, profileUUID, itemDbId: item.id, itemTokens }); } catch {}
        const { rows: exchangeRows } = await query(
          `INSERT INTO exchanges (profile_id, item_id, exchange_tokens, status)
           VALUES ($1, $2, $3, 'pending')
           RETURNING id`,
          [profileUUID, item.id, itemTokens]
        );
        const exchangeId = exchangeRows[0].id;
        try { console.log('[redeem] db:exchanges:inserted', { correlationId, exchangeId }); } catch {}

        // 7. Atomically assign an available item code (if inventory is managed)
        let assignedCode = null;
        let assignedCodeId = null;
        try { console.log('[redeem] db:item_codes:assign:start', { correlationId, itemID }); } catch {}
        const { rows: codeRows } = await query(
          `WITH next_code AS (
             SELECT id, code FROM item_codes
              WHERE item_id = $1 AND status = 'available'
              ORDER BY created_at ASC
              FOR UPDATE SKIP LOCKED
              LIMIT 1
           )
           UPDATE item_codes ic
              SET status = 'redeemed',
                  assigned_to_profile_id = $2,
                  assigned_at = NOW(),
                  redeemed_at = NOW()
             FROM next_code nc
            WHERE ic.id = nc.id
            RETURNING ic.id, ic.code`,
          [item.id, profileUUID]
        );
        if (codeRows && codeRows.length > 0) {
          assignedCode = codeRows[0].code;
          assignedCodeId = codeRows[0].id;
          try { console.log('[redeem] db:item_codes:assign:success', { correlationId, codeId: assignedCodeId }); } catch {}
        } else {
          // If no code is available, we consider it out of stock
          try { console.warn('[redeem] db:item_codes:assign:none_available', { correlationId, itemID }); } catch {}
          await query('ROLLBACK');
          return res.status(409).json({
            success: false,
            error: 'This item is out of stock.',
            correlationId,
          });
        }

        // 8. Create redemption record with detailed information and code linkage
        try { console.log('[redeem] db:redemptions:insert', { correlationId, profileUUID, exchangeId, itemCodeId: assignedCodeId }); } catch {}
        const { rows: redemptionRows } = await query(
          `INSERT INTO redemptions (
            profile_id, item_id, exchange_id, item_code_id, full_name, email, phone,
            address, city, state, zip_code, country, special_instructions,
            status
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'pending')
           RETURNING id`,
          [
            profileUUID, item.id, exchangeId, assignedCodeId, fullName, email, phone,
            address, city, state, zipCode, country, specialInstructions || null
          ]
        );
        const redemptionId = redemptionRows[0].id;
        try { console.log('[redeem] db:redemptions:inserted', { correlationId, redemptionId }); } catch {}

        // 9. Update exchange status to 'completed'
        try { console.log('[redeem] db:exchanges:update_status', { correlationId, exchangeId, status: 'completed' }); } catch {}
        await query(
          'UPDATE exchanges SET status = $1 WHERE id = $2',
          ['completed', exchangeId]
        );

        // Commit the transaction
        await query('COMMIT');
        try { console.log('[redeem] db:commit', { correlationId }); } catch {}

        // 10. Log the successful redemption
        console.log('Redemption created successfully:', {
          correlationId,
          redemptionId,
          exchangeId,
          profileID: userProfileID,
          itemID,
          itemName: item.title,
          tokensSpent: itemTokens,
          newBalance: availableBalance - itemTokens
        });

        // 11. Send confirmation email (best-effort; do not block success)
        try {
          const subject = `Your redemption code for ${item.title}`;
          const lines = [
            `Hi ${fullName},`,
            '',
            `Thanks for redeeming your prize: ${item.title}.`,
            '',
            `Here is your one-time code:`,
            assignedCode ? String(assignedCode) : '[code unavailable]',
            '',
            `Keep this code safe. It can be used only once.`,
            '',
            `If you have any questions, reply to this email.`,
          ];
          const textBody = lines.join('\n');
          try { console.log('[redeem] email:user:send_attempt', { correlationId, to: email, subject }); } catch {}
          const emailResult1 = await sendEmail({
            to: email,
            subject,
            text: textBody,
            meta: { correlationId, kind: 'user_confirmation', itemCodeId: assignedCodeId }
          });
          try { console.log('[redeem] email:user:send_result', { correlationId, result: emailResult1 }); } catch {}
        } catch (e) {
          try { console.warn('[redeem] email:user:error (non-blocking)', { correlationId, message: e?.message || String(e) }); } catch {}
        }

        // 12. Notify internal team (best-effort; do not block success)
        try {
          const notifyTo = (process.env.MARKETPLACE_REDEEM_NOTIFICATIONS_TO || 'info@takers.world').trim();
          const subject = `New marketplace redemption: ${item.title}`;
          const lines = [
            `A new marketplace redemption has been submitted.`,
            '',
            `Item: ${item.title}`,
            `Cost (tokens): ${itemTokens}`,
            ...(assignedCode ? [`Assigned Code: ${assignedCode}`] : []),
            '',
            `User: ${fullName}`,
            `Email: ${email}`,
            `Phone: ${phone}`,
            `Profile ID: ${userProfileID}`,
            '',
            `Redemption ID: ${redemptionId}`,
            `Exchange ID: ${exchangeId}`,
            '',
            `Shipping address:`,
            `${address || ''}`,
            `${city || ''}, ${state || ''} ${zipCode || ''}`,
            `${country || ''}`,
            '',
            ...(specialInstructions ? [
              'Special instructions:',
              String(specialInstructions),
              ''
            ] : []),
          ];
          const textBody = lines.join('\n');
          try { console.log('[redeem] email:admin:send_attempt', { correlationId, to: notifyTo, subject }); } catch {}
          const emailResult2 = await sendEmail({
            to: notifyTo,
            subject,
            text: textBody,
            meta: { correlationId, kind: 'admin_notification', redemptionId, exchangeId, itemCodeId: assignedCodeId }
          });
          try { console.log('[redeem] email:admin:send_result', { correlationId, result: emailResult2 }); } catch {}
        } catch (e) {
          try { console.warn('[redeem] email:admin:error (non-blocking)', { correlationId, message: e?.message || String(e) }); } catch {}
        }

        res.status(200).json({
          success: true,
          message: 'Redemption request submitted successfully',
          redemptionID: redemptionId,
          exchangeID: exchangeId,
          tokensSpent: itemTokens,
          remainingBalance: availableBalance - itemTokens,
          correlationId,
          code: assignedCode
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
    try { console.error('[redeem] api:error', { correlationId, message: error?.message || String(error) }); } catch {}
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      correlationId
    });
  }
}
