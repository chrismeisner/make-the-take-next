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
        teamNameShort: fields.teamNameShort || null,
        teamAbbreviation: fields.teamAbbreviation || '',
        teamLeague: fields.teamLeague || '',
        teamType: fields.teamType || '',
        teamLogo,
        teamLogoURL: fields.teamLogoURL || null,
        teamHomeSide: Array.isArray(fields.teamHomeSide) ? (fields.teamHomeSide[0] || null) : (fields.teamHomeSide || null),
        teamAwaySide: Array.isArray(fields.teamAwaySide) ? (fields.teamAwaySide[0] || null) : (fields.teamAwaySide || null),
      };
    });
  }

  async getById(idOrTeamID) {
    const records = await airtableBase('Teams')
      .select({
        filterByFormula: `OR(RECORD_ID() = "${idOrTeamID}", {teamID} = "${idOrTeamID}")`,
        maxRecords: 1,
      })
      .firstPage();
    if (!records?.length) return null;
    const record = records[0];
    const fields = record.fields || {};
    return {
      recordId: record.id,
      teamID: fields.teamID || record.id,
      teamName: fields.teamName || 'Unknown Team',
      teamNameFull: fields.teamNameFull || (fields.teamName || 'Unknown Team'),
      teamNameShort: fields.teamNameShort || null,
      teamAbbreviation: fields.teamAbbreviation || '',
      teamLeague: fields.teamLeague || '',
      teamType: fields.teamType || '',
      teamLogo: Array.isArray(fields.teamLogo)
        ? fields.teamLogo.map((img) => ({ url: img.url, filename: img.filename }))
        : [],
      teamLogoURL: fields.teamLogoURL || null,
      teamHomeSide: Array.isArray(fields.teamHomeSide) ? (fields.teamHomeSide[0] || null) : (fields.teamHomeSide || null),
      teamAwaySide: Array.isArray(fields.teamAwaySide) ? (fields.teamAwaySide[0] || null) : (fields.teamAwaySide || null),
    };
  }

  async createOne(data) {
    const fields = {};
    if (data.teamID !== undefined) fields.teamID = data.teamID;
    if (data.teamName !== undefined) fields.teamName = data.teamName;
    if (data.teamNameFull !== undefined) fields.teamNameFull = data.teamNameFull;
    if (data.teamNameShort !== undefined) fields.teamNameShort = data.teamNameShort;
    if (data.teamAbbreviation !== undefined) fields.teamAbbreviation = data.teamAbbreviation;
    if (data.teamLeague !== undefined) fields.teamLeague = data.teamLeague;
    if (data.teamType !== undefined) fields.teamType = data.teamType;
    if (data.teamLogoURL) fields.teamLogoURL = data.teamLogoURL;
    if (Array.isArray(data.teamLogo) && data.teamLogo.length > 0) {
      fields.teamLogo = data.teamLogo.map((u) => (typeof u === 'string' ? { url: u } : u));
    }
    if (data.teamHomeSide) fields.teamHomeSide = [{ url: data.teamHomeSide.url, filename: data.teamHomeSide.filename }];
    if (data.teamAwaySide) fields.teamAwaySide = [{ url: data.teamAwaySide.url, filename: data.teamAwaySide.filename }];
    const [created] = await airtableBase('Teams').create([{ fields }], { typecast: true });
    return { id: created.id };
  }

  async updateOne(idOrTeamID, fieldsInput) {
    const existing = await airtableBase('Teams')
      .select({
        filterByFormula: `OR(RECORD_ID() = "${idOrTeamID}", {teamID} = "${idOrTeamID}")`,
        maxRecords: 1,
      })
      .firstPage();
    if (!existing?.length) return null;
    const recordId = existing[0].id;
    const fields = {};
    if (fieldsInput.teamID !== undefined) fields.teamID = fieldsInput.teamID;
    if (fieldsInput.teamName !== undefined) fields.teamName = fieldsInput.teamName;
    if (fieldsInput.teamNameFull !== undefined) fields.teamNameFull = fieldsInput.teamNameFull;
    if (fieldsInput.teamNameShort !== undefined) fields.teamNameShort = fieldsInput.teamNameShort;
    if (fieldsInput.teamAbbreviation !== undefined) fields.teamAbbreviation = fieldsInput.teamAbbreviation;
    if (fieldsInput.teamLeague !== undefined) fields.teamLeague = fieldsInput.teamLeague;
    if (fieldsInput.teamType !== undefined) fields.teamType = fieldsInput.teamType;
    if (fieldsInput.teamLogoURL !== undefined) fields.teamLogoURL = fieldsInput.teamLogoURL;
    if (Array.isArray(fieldsInput.teamLogo)) {
      fields.teamLogo = fieldsInput.teamLogo.map((u) => (typeof u === 'string' ? { url: u } : u));
    }
    if (fieldsInput.teamHomeSide !== undefined) {
      fields.teamHomeSide = fieldsInput.teamHomeSide ? [{ url: fieldsInput.teamHomeSide.url, filename: fieldsInput.teamHomeSide.filename }] : [];
    }
    if (fieldsInput.teamAwaySide !== undefined) {
      fields.teamAwaySide = fieldsInput.teamAwaySide ? [{ url: fieldsInput.teamAwaySide.url, filename: fieldsInput.teamAwaySide.filename }] : [];
    }
    const [updated] = await airtableBase('Teams').update([{ id: recordId, fields }], { typecast: true });
    return { id: updated.id };
  }

  async deleteOne(idOrTeamID) {
    const existing = await airtableBase('Teams')
      .select({
        filterByFormula: `OR(RECORD_ID() = "${idOrTeamID}", {teamID} = "${idOrTeamID}")`,
        maxRecords: 1,
      })
      .firstPage();
    if (!existing?.length) return { success: false, notFound: true };
    const recordId = existing[0].id;
    await airtableBase('Teams').destroy([recordId]);
    return { success: true };
  }
}


