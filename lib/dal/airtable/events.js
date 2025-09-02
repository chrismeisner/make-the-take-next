import { airtableBase } from '../../airtableBase';
import { EventsRepository } from '../contracts';

export class AirtableEventsRepository extends EventsRepository {
  async getById(eventId) {
    try {
      const rec = await airtableBase('Events').find(eventId);
      const f = rec.fields || {};
      return {
        id: rec.id,
        espnGameID: f.espnGameID || null,
        eventLeague: f.eventLeague || null,
        eventTime: f.eventTime || null,
        homeTeamLink: f.homeTeamLink || null,
        awayTeamLink: f.awayTeamLink || null,
      };
    } catch {
      return null;
    }
  }
}


