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
    return rec;
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


