// lib/dal/contracts.js
// Repository contracts used by API routes. Implement for Airtable and Postgres.

/**
 * PropsRepository
 * - getByPropID(propID)
 * - listByPackURL(packURL)
 * - createOne(data)
 * - updateMany(updates)
 */
export class PropsRepository {
  async getByPropID(propID) { throw new Error('Not implemented'); }
  async listByPackURL(packURL) { throw new Error('Not implemented'); }
  async createOne(data) { throw new Error('Not implemented'); }
  async updateMany(updates) { throw new Error('Not implemented'); }
}

/**
 * PacksRepository
 * - getByPackURL(packURL)
 */
export class PacksRepository {
  async getByPackURL(packURL) { throw new Error('Not implemented'); }
}

/**
 * TakesRepository
 * - createLatestTake({ propID, propSide, phone, fields })
 * - countBySides(propID)
 * - getLatestForUser({ propID, phone })
 * - listLatestForPhone(phone)
 */
export class TakesRepository {
  async createLatestTake(params) { throw new Error('Not implemented'); }
  async countBySides(propID) { throw new Error('Not implemented'); }
  async getLatestForUser(params) { throw new Error('Not implemented'); }
  async listLatestForPhone(phone) { throw new Error('Not implemented'); }
}

/**
 * ProfilesRepository
 * - ensureByPhone(phoneE164)
 * - getByProfileID(profileID)
 */
export class ProfilesRepository {
  async ensureByPhone(phoneE164) { throw new Error('Not implemented'); }
  async getByProfileID(profileID) { throw new Error('Not implemented'); }
}


