// File: pages/api/notifications/preferences.js

import { getCurrentUser } from "../../../lib/auth";
import { getDataBackend } from "../../../lib/runtimeConfig";
import { query } from "../../../lib/db/postgres";

export default async function handler(req, res) {
  const backend = getDataBackend();
  if (backend !== 'postgres') {
    return res.status(400).json({ success: false, error: 'Postgres backend required' });
  }

  const user = await getCurrentUser(req);
  if (!user || !user.userId) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  if (req.method === 'GET') {
    try {
      const { rows: prefRows } = await query(
        `SELECT LOWER(COALESCE(league,'')) AS league
           FROM notification_preferences
          WHERE profile_id = $1 AND category = 'pack_open' AND opted_in = TRUE
          ORDER BY league ASC`,
        [user.userId]
      );
      const leagues = prefRows.map(r => r.league).filter(Boolean);
      const { rows: profRows } = await query(
        `SELECT COALESCE(sms_opt_out_all, FALSE) AS sms_opt_out_all FROM profiles WHERE id = $1`,
        [user.userId]
      );
      const smsOptOutAll = Boolean(profRows?.[0]?.sms_opt_out_all);
      return res.status(200).json({ success: true, category: 'pack_open', leagues, smsOptOutAll });
    } catch (error) {
      console.error('[notifications/preferences][GET] error =>', error);
      return res.status(500).json({ success: false, error: 'Failed to load preferences' });
    }
  }

  if (req.method === 'PUT') {
    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const category = String(body.category || 'pack_open').toLowerCase();
      if (category !== 'pack_open') {
        return res.status(400).json({ success: false, error: 'Unsupported category' });
      }
      const inputLeagues = Array.isArray(body.leagues) ? body.leagues : [];
      const normalized = [...new Set(inputLeagues.map(l => String(l || '').trim().toLowerCase()).filter(Boolean))];
      const upsertValues = normalized.map((l, i) => `($1, 'pack_open', $${i + 2}, TRUE)`).join(', ');

      // Clear existing, then insert selected
      await query(`DELETE FROM notification_preferences WHERE profile_id = $1 AND category = 'pack_open'`, [user.userId]);
      if (normalized.length > 0) {
        await query(
          `INSERT INTO notification_preferences (profile_id, category, league, opted_in)
           VALUES ${upsertValues}
           ON CONFLICT (profile_id, category, league)
           DO UPDATE SET opted_in = EXCLUDED.opted_in, updated_at = NOW()`,
          [user.userId, ...normalized]
        );
      }

      if (typeof body.smsOptOutAll === 'boolean') {
        await query(
          `UPDATE profiles SET sms_opt_out_all = $2 WHERE id = $1`,
          [user.userId, body.smsOptOutAll]
        );
      }

      return res.status(200).json({ success: true, category: 'pack_open', leagues: normalized });
    } catch (error) {
      console.error('[notifications/preferences][PUT] error =>', error);
      return res.status(500).json({ success: false, error: 'Failed to save preferences' });
    }
  }

  return res.status(405).json({ success: false, error: 'Method not allowed' });
}


