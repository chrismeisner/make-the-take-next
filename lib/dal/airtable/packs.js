// lib/dal/airtable/packs.js
import { airtableBase } from '../../airtableBase';
import { escapeFormulaValue } from '../airtableUtils';
import { PacksRepository } from '../contracts';

export class AirtablePacksRepository extends PacksRepository {
  async getByPackURL(packURL) {
    const safe = escapeFormulaValue(packURL);
    const records = await airtableBase('Packs')
      .select({ filterByFormula: `{packURL} = "${safe}"`, maxRecords: 1 })
      .firstPage();
    if (!records?.length) return null;
    const r = records[0];
    return { id: r.id, ...r.fields };
  }

  async createOne(data) {
    const fields = {};
    if (data.packTitle !== undefined) fields.packTitle = data.packTitle;
    if (data.packSummary !== undefined) fields.packSummary = data.packSummary;
    if (data.packURL !== undefined) fields.packURL = data.packURL;
    if (data.packType !== undefined) fields.packType = data.packType;
    if (data.packLeague !== undefined) fields.packLeague = data.packLeague;
    if (data.packStatus !== undefined) fields.packStatus = data.packStatus;
    if (data.packOpenTime !== undefined) fields.packOpenTime = data.packOpenTime;
    if (data.packCloseTime !== undefined) fields.packCloseTime = data.packCloseTime;
    if (data.packCoverUrl) fields.packCover = [{ url: data.packCoverUrl }];
    if (Array.isArray(data.events)) fields.Event = data.events;
    if (Array.isArray(data.props)) fields.Props = data.props;
    const [created] = await airtableBase('Packs').create([{ fields }], { typecast: true });
    return { id: created.id };
  }

  async updateByPackURL(packURL, fieldsInput) {
    const safe = escapeFormulaValue(packURL);
    const recs = await airtableBase('Packs')
      .select({ filterByFormula: `{packURL} = "${safe}"`, maxRecords: 1 })
      .firstPage();
    if (!recs?.length) return null;
    const recordId = recs[0].id;
    const fields = {};
    if (fieldsInput.packTitle !== undefined) fields.packTitle = fieldsInput.packTitle;
    if (fieldsInput.packSummary !== undefined) fields.packSummary = fieldsInput.packSummary;
    if (fieldsInput.packType !== undefined) fields.packType = fieldsInput.packType;
    if (fieldsInput.packLeague !== undefined) fields.packLeague = fieldsInput.packLeague;
    if (fieldsInput.packStatus !== undefined) fields.packStatus = fieldsInput.packStatus;
    if (fieldsInput.packOpenTime !== undefined) fields.packOpenTime = fieldsInput.packOpenTime;
    if (fieldsInput.packCloseTime !== undefined) fields.packCloseTime = fieldsInput.packCloseTime;
    if (fieldsInput.packCoverUrl) fields.packCover = [{ url: fieldsInput.packCoverUrl }];
    if (Array.isArray(fieldsInput.events)) fields.Event = fieldsInput.events;
    if (Array.isArray(fieldsInput.props)) fields.Props = fieldsInput.props;
    const [updated] = await airtableBase('Packs').update([{ id: recordId, fields }], { typecast: true });
    return { id: updated.id };
  }
}


