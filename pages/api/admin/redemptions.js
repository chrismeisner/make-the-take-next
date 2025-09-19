import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import { getDataBackend } from '../../../lib/runtimeConfig';
import { query } from '../../../lib/db/postgres';

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  
  // Check authentication and super admin status
  if (!session?.user?.superAdmin) {
    return res.status(403).json({ success: false, error: 'Super admin access required' });
  }

  if (req.method === 'GET') {
    try {
      const backend = getDataBackend();
      
      if (backend === 'postgres') {
        // Fetch all redemptions with related data
        const { rows } = await query(`
          SELECT 
            r.id,
            r.full_name,
            r.email,
            r.phone,
            r.address,
            r.city,
            r.state,
            r.zip_code,
            r.country,
            r.special_instructions,
            r.status,
            r.created_at,
            r.updated_at,
            r.admin_notes,
            r.tracking_number,
            r.shipped_at,
            r.delivered_at,
            i.title as item_name,
            i.brand as item_brand,
            e.exchange_tokens,
            p.profile_id as user_profile_id
          FROM redemptions r
          JOIN items i ON r.item_id = i.id
          JOIN exchanges e ON r.exchange_id = e.id
          JOIN profiles p ON r.profile_id = p.id
          ORDER BY r.created_at DESC
        `);

        return res.status(200).json({
          success: true,
          redemptions: rows
        });
      } else {
        return res.status(501).json({
          success: false,
          error: 'Non-Postgres backends not implemented for admin redemptions'
        });
      }

    } catch (error) {
      console.error('Error fetching redemptions:', error);
      return res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }

  if (req.method === 'PUT') {
    try {
      const { redemptionId, status, adminNotes, trackingNumber } = req.body;

      if (!redemptionId) {
        return res.status(400).json({
          success: false,
          error: 'Redemption ID is required'
        });
      }

      const backend = getDataBackend();
      
      if (backend === 'postgres') {
        // Update redemption record
        const updateFields = [];
        const updateValues = [];
        let paramCount = 1;

        if (status) {
          updateFields.push(`status = $${paramCount++}`);
          updateValues.push(status);
        }

        if (adminNotes !== undefined) {
          updateFields.push(`admin_notes = $${paramCount++}`);
          updateValues.push(adminNotes);
        }

        if (trackingNumber !== undefined) {
          updateFields.push(`tracking_number = $${paramCount++}`);
          updateValues.push(trackingNumber);
        }

        // Set shipped_at timestamp if status is being changed to 'shipped'
        if (status === 'shipped') {
          updateFields.push(`shipped_at = NOW()`);
        }

        // Set delivered_at timestamp if status is being changed to 'delivered'
        if (status === 'delivered') {
          updateFields.push(`delivered_at = NOW()`);
        }

        if (updateFields.length === 0) {
          return res.status(400).json({
            success: false,
            error: 'No fields to update'
          });
        }

        updateValues.push(redemptionId);
        const updateQuery = `
          UPDATE redemptions 
          SET ${updateFields.join(', ')}
          WHERE id = $${paramCount}
          RETURNING *
        `;

        const { rows } = await query(updateQuery, updateValues);

        if (rows.length === 0) {
          return res.status(404).json({
            success: false,
            error: 'Redemption not found'
          });
        }

        return res.status(200).json({
          success: true,
          redemption: rows[0]
        });
      } else {
        return res.status(501).json({
          success: false,
          error: 'Non-Postgres backends not implemented for admin redemptions'
        });
      }

    } catch (error) {
      console.error('Error updating redemption:', error);
      return res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }

  return res.status(405).json({
    success: false,
    error: 'Method not allowed'
  });
}
