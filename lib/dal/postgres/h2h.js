// lib/dal/postgres/h2h.js
import { query } from '../../db/postgres';

function toInt(x) {
  if (x == null) return 0;
  if (typeof x === 'number') return Math.trunc(x);
  const n = Number(x);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

export class PostgresH2HRepository {
  async createChallenge({ packId, profileAId, token, bonusAmount = 0, tiePolicy = 'split' }) {
    const { rows } = await query(
      `INSERT INTO h2h_matchups (pack_id, profile_a_id, token, status, bonus_amount, tie_policy)
       VALUES ($1, $2, $3, 'pending', $4, $5)
       RETURNING *`,
      [packId, profileAId, token, toInt(bonusAmount), String(tiePolicy || 'split')]
    );
    return rows[0];
  }

  async acceptChallenge({ token, profileBId }) {
    const { rows } = await query(
      `UPDATE h2h_matchups
         SET profile_b_id = COALESCE(profile_b_id, $2),
             status = CASE WHEN profile_b_id IS NULL THEN 'accepted' ELSE status END,
             accepted_at = CASE WHEN profile_b_id IS NULL THEN NOW() ELSE accepted_at END
       WHERE token = $1 AND status IN ('pending','accepted')
       RETURNING *`,
      [token, profileBId]
    );
    return rows[0] || null;
  }

  async getByToken(token) {
    const { rows } = await query(`SELECT * FROM h2h_matchups WHERE token = $1 LIMIT 1`, [token]);
    return rows[0] || null;
  }

  async getPackRowByAny(packParam) {
    // Accept text pack_id or UUID id
    const uuidRegex = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i;
    let rows = [];
    // Try by pack_url first (canonical slug), then pack_id (external id), then UUID id
    ({ rows } = await query(`SELECT * FROM packs WHERE pack_url = $1 LIMIT 1`, [packParam]));
    if (!rows.length) {
      ({ rows } = await query(`SELECT * FROM packs WHERE pack_id = $1 LIMIT 1`, [packParam]));
    }
    if (!rows.length && uuidRegex.test(String(packParam))) {
      ({ rows } = await query(`SELECT * FROM packs WHERE id = $1::uuid LIMIT 1`, [packParam]));
    }
    return rows[0] || null;
  }

  async computeUserStatsForPack({ packId, profileId }) {
    // Correct = props graded A/B and user's side matches
    const { rows: correctRows } = await query(
      `SELECT COUNT(*)::int AS correct
         FROM takes t
         JOIN props p ON p.id = t.prop_id
        WHERE t.take_status = 'latest'
          AND t.profile_id = $1
          AND t.pack_id = $2
          AND (
            (p.prop_status = 'gradedA' AND t.prop_side = 'A') OR
            (p.prop_status = 'gradedB' AND t.prop_side = 'B')
          )`,
      [profileId, packId]
    );
    const correct = correctRows[0]?.correct || 0;

    const { rows: tokenRows } = await query(
      `SELECT COALESCE(SUM(COALESCE(t.tokens,0)),0)::int AS tokens
         FROM takes t
        WHERE t.take_status = 'latest'
          AND t.profile_id = $1
          AND t.pack_id = $2`,
      [profileId, packId]
    );
    const tokens = tokenRows[0]?.tokens || 0;
    return { correct: toInt(correct), tokens: toInt(tokens) };
  }

  async finalizeByToken(token) {
    const matchup = await this.getByToken(token);
    if (!matchup) return null;
    if (!matchup.profile_a_id || !matchup.profile_b_id) return null;

    const aStats = await this.computeUserStatsForPack({ packId: matchup.pack_id, profileId: matchup.profile_a_id });
    const bStats = await this.computeUserStatsForPack({ packId: matchup.pack_id, profileId: matchup.profile_b_id });

    // Winner resolution: higher correct -> higher tokens -> tie
    let winnerProfileId = null;
    if (aStats.correct > bStats.correct) winnerProfileId = matchup.profile_a_id;
    else if (bStats.correct > aStats.correct) winnerProfileId = matchup.profile_b_id;
    else if (aStats.tokens > bStats.tokens) winnerProfileId = matchup.profile_a_id;
    else if (bStats.tokens > aStats.tokens) winnerProfileId = matchup.profile_b_id;

    let bonusSplitA = null;
    let bonusSplitB = null;
    if (winnerProfileId) {
      bonusSplitA = winnerProfileId === matchup.profile_a_id ? toInt(matchup.bonus_amount) : 0;
      bonusSplitB = winnerProfileId === matchup.profile_b_id ? toInt(matchup.bonus_amount) : 0;
    } else {
      const policy = String(matchup.tie_policy || 'split').toLowerCase();
      if (policy === 'split') {
        const half = Math.floor(toInt(matchup.bonus_amount) / 2);
        bonusSplitA = half;
        bonusSplitB = toInt(matchup.bonus_amount) - half;
      } else if (policy === 'both') {
        bonusSplitA = toInt(matchup.bonus_amount);
        bonusSplitB = toInt(matchup.bonus_amount);
      } else {
        bonusSplitA = 0;
        bonusSplitB = 0;
      }
    }

    const { rows } = await query(
      `UPDATE h2h_matchups
          SET a_correct = $2,
              b_correct = $3,
              a_tokens  = $4,
              b_tokens  = $5,
              winner_profile_id = $6,
              bonus_split_a = $7,
              bonus_split_b = $8,
              status = 'final',
              finalized_at = NOW()
        WHERE token = $1
        RETURNING *`,
      [
        token,
        aStats.correct,
        bStats.correct,
        aStats.tokens,
        bStats.tokens,
        winnerProfileId,
        bonusSplitA,
        bonusSplitB,
      ]
    );
    return rows[0] || null;
  }
}


