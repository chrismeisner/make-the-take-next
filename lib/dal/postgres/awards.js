// lib/dal/postgres/awards.js
import { AwardsRepository } from '../contracts';
import { query } from '../../db/postgres';

export class PostgresAwardsRepository extends AwardsRepository {
  async getByCode(code) {
    if (!code || typeof code !== 'string') return null;
    const { rows } = await query(
      `SELECT id, code, name, tokens, status, redeemed_by_profile_id, redeemed_at, valid_from, valid_to, redirect_team_slug, image_url, created_at
         FROM award_cards
        WHERE code = $1
        LIMIT 1`,
      [code]
    );
    return rows[0] || null;
  }

  async redeemAvailableByCode(code, profileRowId) {
    if (!code || !profileRowId) return null;
    // Allow multiple users to redeem: do not flip global status. Only validate availability window
    const rec = await this.getByCode(code);
    if (!rec) return null;
    const now = Date.now();
    const isBefore = rec.valid_from ? new Date(rec.valid_from).getTime() > now : false;
    const isAfter = rec.valid_to ? new Date(rec.valid_to).getTime() < now : false;
    if (isBefore || isAfter || rec.status === 'disabled') return null;
    // Insert per-user redemption with uniqueness constraint
    const { rows } = await query(
      `INSERT INTO award_redemptions (award_card_id, profile_id)
         SELECT id, $2 FROM award_cards WHERE code = $1
       ON CONFLICT (award_card_id, profile_id) DO NOTHING
       RETURNING id`,
      [code, profileRowId]
    );
    if (!rows.length) {
      // Already redeemed by this user
      return { ...rec, alreadyRedeemed: true };
    }
    return { ...rec, redemptionId: rows[0].id };
  }

  async setRedemptionContext({ code, profileRowId, packId, referredProfileId, referredTakeId }) {
    if (!code || !profileRowId) return false;
    const updates = [];
    const vals = [];
    let idx = 1;
    if (packId) { updates.push(`pack_id = $${idx++}`); vals.push(packId); }
    if (referredProfileId) { updates.push(`referred_profile_id = $${idx++}`); vals.push(referredProfileId); }
    if (referredTakeId) { updates.push(`referred_take_id = $${idx++}`); vals.push(referredTakeId); }
    if (updates.length === 0) return false;
    const sql = `UPDATE award_redemptions ar
                   SET ${updates.join(', ')}
                 FROM award_cards a
                 WHERE ar.award_card_id = a.id
                   AND a.code = $${idx}
                   AND ar.profile_id = $${idx + 1}
               RETURNING ar.id`;
    vals.push(code, profileRowId);
    try {
      const { rows } = await query(sql, vals);
      return rows.length > 0;
    } catch (_) {
      return false;
    }
  }

  async ensureUserRedemption(code, profileRowId) {
    if (!code || !profileRowId) return false;
    const { rows } = await query(
      `SELECT 1
         FROM award_redemptions ar
         JOIN award_cards a ON a.id = ar.award_card_id
        WHERE a.code = $1 AND ar.profile_id = $2
        LIMIT 1`,
      [code, profileRowId]
    );
    return rows.length > 0;
  }
}


