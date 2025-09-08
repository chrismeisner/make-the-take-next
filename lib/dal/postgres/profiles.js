// lib/dal/postgres/profiles.js
import { ProfilesRepository } from '../contracts';
import { query } from '../../db/postgres';

export class PostgresProfilesRepository extends ProfilesRepository {
  async ensureByPhone(phoneE164) {
    const { rows } = await query('SELECT * FROM profiles WHERE mobile_e164 = $1 LIMIT 1', [phoneE164]);
    if (rows.length) return rows[0];
    // Generate a unique profile_id like "taker123456" (6 random digits)
    // Retry a few times if a rare uniqueness collision occurs
    for (let attempt = 0; attempt < 5; attempt++) {
      const randomSix = Math.floor(100000 + Math.random() * 900000);
      const generatedProfileId = `taker${randomSix}`;
      try {
        const { rows: created } = await query(
          'INSERT INTO profiles (mobile_e164, profile_id) VALUES ($1, $2) RETURNING *',
          [phoneE164, generatedProfileId]
        );
        return created[0];
      } catch (err) {
        // 23505 = unique_violation; if collision on profile_id, retry, otherwise rethrow
        if (err && err.code === '23505') continue;
        throw err;
      }
    }
    throw new Error('Failed to create profile: could not generate a unique profile_id');
  }

  async getByProfileID(profileID) {
    const { rows } = await query('SELECT * FROM profiles WHERE profile_id = $1 LIMIT 1', [profileID]);
    return rows[0] || null;
  }
}


