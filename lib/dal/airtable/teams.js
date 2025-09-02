import { airtableBase } from '../../airtableBase';
import { TeamsRepository } from '../contracts';

export class AirtableTeamsRepository extends TeamsRepository {
  async listAll() {
    const records = await airtableBase('Teams').select({ maxRecords: 100 }).all();
    return records.map((record) => {
      const fields = record.fields || {};
      let teamLogo = [];
      if (Array.isArray(fields.teamLogo)) {
        teamLogo = fields.teamLogo.map((img) => ({ url: img.url, filename: img.filename }));
      }
      return {
        recordId: record.id,
        teamID: fields.teamID || record.id,
        teamName: fields.teamName || 'Unknown Team',
        teamNameFull: fields.teamNameFull || (fields.teamName || 'Unknown Team'),
        teamAbbreviation: fields.teamAbbreviation || '',
        teamLeague: fields.teamLeague || '',
        teamType: fields.teamType || '',
        teamLogo,
        teamLogoURL: fields.teamLogoURL || null,
      };
    });
  }
}


