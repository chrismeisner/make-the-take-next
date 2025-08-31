// lib/dal/airtable/props.js
import { airtableBase } from '../../airtableBase';
import { escapeFormulaValue } from '../airtableUtils';
import { PropsRepository } from '../contracts';

export class AirtablePropsRepository extends PropsRepository {
  async getByPropID(propID) {
    const safe = escapeFormulaValue(propID);
    const records = await airtableBase('Props')
      .select({ filterByFormula: `{propID} = "${safe}"`, maxRecords: 1 })
      .firstPage();
    if (!records?.length) return null;
    const r = records[0];
    return { id: r.id, createdAt: r._rawJson?.createdTime, ...r.fields };
  }

  async listByPackURL(packURL) {
    const safe = escapeFormulaValue(packURL);
    // Fetch pack to get record id, then list props linked to pack
    const packs = await airtableBase('Packs')
      .select({ filterByFormula: `{packURL} = "${safe}"`, maxRecords: 1 })
      .firstPage();
    if (!packs?.length) return [];
    const packId = packs[0].id;
    const props = await airtableBase('Props')
      .select({ filterByFormula: `FIND('${packId}', ARRAYJOIN({Packs}))>0`, maxRecords: 500 })
      .all();
    return props.map((r) => ({ id: r.id, createdAt: r._rawJson?.createdTime, ...r.fields }));
  }

  async createOne(data) {
    const created = await airtableBase('Props').create([{ fields: data }]);
    const r = created[0];
    return { id: r.id, createdAt: r._rawJson?.createdTime, ...r.fields };
  }

  async updateMany(updates) {
    // updates: [{ id, fields }]
    if (!Array.isArray(updates) || updates.length === 0) return [];
    const chunks = [];
    for (let i = 0; i < updates.length; i += 10) {
      chunks.push(updates.slice(i, i + 10));
    }
    const results = [];
    for (const chunk of chunks) {
      const updated = await airtableBase('Props').update(chunk);
      results.push(...updated.map((r) => ({ id: r.id, createdAt: r._rawJson?.createdTime, ...r.fields })));
    }
    return results;
  }
}


