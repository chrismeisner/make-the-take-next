// lib/dal/postgres/profiles.js
import { ProfilesRepository } from '../contracts';
import { query } from '../../db/postgres';

export class PostgresProfilesRepository extends ProfilesRepository {
  async ensureByPhone(phoneE164) {
    const { rows } = await query('SELECT * FROM profiles WHERE mobile_e164 = $1 LIMIT 1', [phoneE164]);
    if (rows.length) return rows[0];
    const { rows: created } = await query(
      'INSERT INTO profiles (mobile_e164) VALUES ($1) RETURNING *',
      [phoneE164]
    );
    return created[0];
  }

  async getByProfileID(profileID) {
    const { rows } = await query('SELECT * FROM profiles WHERE profile_id = $1 LIMIT 1', [profileID]);
    return rows[0] || null;
  }
}


