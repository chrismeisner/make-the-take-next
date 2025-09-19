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
 * - createOne(data)
 * - updateByPackURL(packURL, fields)
 */
export class PacksRepository {
  async getByPackURL(packURL) { throw new Error('Not implemented'); }
  async createOne(data) { throw new Error('Not implemented'); }
  async updateByPackURL(packURL, fields) { throw new Error('Not implemented'); }
}

/**
 * TakesRepository
 * - createLatestTake({ propID, propSide, phone, profileId?, fields })
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


/**
 * ContestsRepository
 * - listAll()
 * - getByContestID(contestID)
 * - createOne(data)
 * - linkPacks(contestID, packURLsOrIds)
 */
export class ContestsRepository {
  async listAll() { throw new Error('Not implemented'); }
  async getByContestID(contestID) { throw new Error('Not implemented'); }
  async createOne(data) { throw new Error('Not implemented'); }
  async linkPacks(contestID, packURLsOrIds) { throw new Error('Not implemented'); }
  async listByPackURL(packURL) { throw new Error('Not implemented'); }
}

/**
 * TeamsRepository
 * - listAll()
 * - getById(idOrTeamID)
 * - createOne(data)
 * - updateOne(idOrTeamID, fields)
 * - deleteOne(idOrTeamID)
 */
export class TeamsRepository {
  async listAll() { throw new Error('Not implemented'); }
  async getById(idOrTeamID) { throw new Error('Not implemented'); }
  async createOne(data) { throw new Error('Not implemented'); }
  async updateOne(idOrTeamID, fields) { throw new Error('Not implemented'); }
  async deleteOne(idOrTeamID) { throw new Error('Not implemented'); }
}

/**
 * EventsRepository
 * - getById(eventId)
 */
export class EventsRepository {
  async getById(eventId) { throw new Error('Not implemented'); }
}


/**
 * AwardsRepository
 * - getByCode(code)
 * - redeemAvailableByCode(code, profileRowId)
 */
export class AwardsRepository {
  async getByCode(code) { throw new Error('Not implemented'); }
  async redeemAvailableByCode(code, profileRowId) { throw new Error('Not implemented'); }
  async ensureUserRedemption(code, profileRowId) { throw new Error('Not implemented'); }
}

