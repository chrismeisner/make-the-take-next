// lib/dal/airtable/takes.js
import { airtableBase } from '../../airtableBase';
import { escapeFormulaValue } from '../airtableUtils';
import { TakesRepository } from '../contracts';

export class AirtableTakesRepository extends TakesRepository {
  async createLatestTake({ propID, propSide, phone, fields = {} }) {
    const safePropID = escapeFormulaValue(propID);
    // Find prop
    const propsFound = await airtableBase('Props')
      .select({ filterByFormula: `{propID}="${safePropID}"`, maxRecords: 1 })
      .firstPage();
    if (!propsFound.length) throw new Error('Prop not found');
    const propRec = propsFound[0];

    // Overwrite older takes for this user on this prop
    const safePhone = escapeFormulaValue(phone);
    const oldTakes = await airtableBase('Takes')
      .select({ filterByFormula: `AND({propID}="${safePropID}", {takeMobile}="${safePhone}")` })
      .all();
    if (oldTakes.length) {
      const updates = oldTakes.map((r) => ({ id: r.id, fields: { takeStatus: 'overwritten' } }));
      await airtableBase('Takes').update(updates);
    }

    const packLinks = propRec.fields.Packs || [];
    const created = await airtableBase('Takes').create([
      { fields: { propID, propSide, takeMobile: phone, takeStatus: 'latest', Pack: packLinks, ...fields } },
    ]);
    return created[0].id;
  }

  async countBySides(propID) {
    const safePropID = escapeFormulaValue(propID);
    const active = await airtableBase('Takes')
      .select({ filterByFormula: `AND({propID}="${safePropID}", {takeStatus}!="overwritten")` })
      .all();
    let a = 0, b = 0;
    for (const t of active) {
      if (t.fields.propSide === 'A') a++;
      else if (t.fields.propSide === 'B') b++;
    }
    return { A: a, B: b };
  }

  async getLatestForUser({ propID, phone }) {
    const safePropID = escapeFormulaValue(propID);
    const safePhone = escapeFormulaValue(phone);
    const recs = await airtableBase('Takes')
      .select({ filterByFormula: `AND({propID}="${safePropID}", {takeMobile}="${safePhone}", {takeStatus}="latest")`, maxRecords: 1 })
      .firstPage();
    if (!recs.length) return null;
    const r = recs[0];
    return { id: r.id, ...r.fields };
  }

  async listLatestForPhone(phone) {
    const safePhone = escapeFormulaValue(phone);
    const recs = await airtableBase('Takes')
      .select({ filterByFormula: `AND({takeMobile} = "${safePhone}", {takeStatus} = "latest")`, maxRecords: 5000 })
      .all();
    return recs.map((record) => {
      const f = record.fields;
      return {
        id: record.id,
        takeID: f.TakeID || record.id,
        propID: f.propID || null,
        takeMobile: f.takeMobile || null,
        takeStatus: f.takeStatus || null,
        takeResult: f.takeResult || null,
        packs: f.Packs || [],
      };
    });
  }
}


