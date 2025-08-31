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
}


