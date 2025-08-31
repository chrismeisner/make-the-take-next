// lib/dal/airtable/profiles.js
import { airtableBase } from '../../airtableBase';
import { escapeFormulaValue } from '../airtableUtils';
import { ProfilesRepository } from '../contracts';

export class AirtableProfilesRepository extends ProfilesRepository {
  async ensureByPhone(phoneE164) {
    const safe = escapeFormulaValue(phoneE164);
    const found = await airtableBase('Profiles')
      .select({ filterByFormula: `{profileMobile} = "${safe}"`, maxRecords: 1 })
      .firstPage();
    if (found.length) {
      const r = found[0];
      return { id: r.id, ...r.fields };
    }
    const created = await airtableBase('Profiles').create([{ fields: { profileMobile: phoneE164 } }]);
    const r = created[0];
    return { id: r.id, ...r.fields };
  }

  async getByProfileID(profileID) {
    const safe = escapeFormulaValue(profileID);
    const records = await airtableBase('Profiles')
      .select({ filterByFormula: `{profileID} = "${safe}"`, maxRecords: 1 })
      .firstPage();
    if (!records?.length) return null;
    const r = records[0];
    return { id: r.id, ...r.fields };
  }
}


