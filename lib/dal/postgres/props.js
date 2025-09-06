// lib/dal/postgres/props.js
import { PropsRepository } from '../contracts';
import { query } from '../../db/postgres';

export class PostgresPropsRepository extends PropsRepository {
  #normalizeWriteFields(fields) {
    if (!fields || typeof fields !== 'object') return fields;
    const mapped = { ...fields };
    if (Object.prototype.hasOwnProperty.call(mapped, 'PropSideAShort')) {
      mapped.prop_side_a_short = mapped.PropSideAShort;
      delete mapped.PropSideAShort;
    }
    if (Object.prototype.hasOwnProperty.call(mapped, 'PropSideBShort')) {
      mapped.prop_side_b_short = mapped.PropSideBShort;
      delete mapped.PropSideBShort;
    }
    if (Object.prototype.hasOwnProperty.call(mapped, 'PropSideATake')) {
      mapped.prop_side_a_take = mapped.PropSideATake;
      delete mapped.PropSideATake;
    }
    if (Object.prototype.hasOwnProperty.call(mapped, 'PropSideBTake')) {
      mapped.prop_side_b_take = mapped.PropSideBTake;
      delete mapped.PropSideBTake;
    }
    return mapped;
  }

  async getByPropID(propID) {
    const { rows } = await query('SELECT * FROM props WHERE prop_id = $1 LIMIT 1', [propID]);
    if (rows.length === 0) return null;
    const r = rows[0];
    return this.#map(r);
  }

  async listByPackURL(packURL) {
    const { rows } = await query(
      `SELECT p.* FROM props p
       JOIN packs k ON p.pack_id = k.id
       WHERE k.pack_url = $1
       ORDER BY COALESCE(p.prop_order, 0) ASC`,
      [packURL]
    );
    return rows.map((r) => this.#map(r));
  }

  async createOne(data) {
    const normalized = this.#normalizeWriteFields(data);
    const keys = Object.keys(normalized);
    const vals = Object.values(normalized);
    const cols = keys.map((k) => k).join(', ');
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
    const { rows } = await query(`INSERT INTO props (${cols}) VALUES (${placeholders}) RETURNING *`, vals);
    return this.#map(rows[0]);
  }

  async updateMany(updates) {
    const results = [];
    for (const u of updates) {
      const { id } = u;
      const fields = this.#normalizeWriteFields(u.fields);
      const keys = Object.keys(fields || {});
      if (keys.length === 0) continue;
      const sets = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
      const vals = keys.map((k) => fields[k]);
      vals.push(id);
      const { rows } = await query(`UPDATE props SET ${sets}, updated_at = NOW() WHERE id = $${keys.length + 1} RETURNING *`, vals);
      results.push(this.#map(rows[0]));
    }
    return results;
  }

  #map(r) {
    return {
      id: r.id,
      createdAt: r.created_at || null,
      updatedAt: r.updated_at || null,
      propID: r.prop_id,
      prop_short: r.prop_short,
      propShort: r.prop_short,
      propTitle: r.prop_title,
      propSummary: r.prop_summary,
      // Short labels for A/B sides
      PropSideAShort: r.prop_side_a_short || '',
      PropSideBShort: r.prop_side_b_short || '',
      // Take text for A/B sides
      PropSideATake: r.prop_side_a_take || '',
      PropSideBTake: r.prop_side_b_take || '',
      prop_type: r.prop_type,
      propType: r.prop_type,
      prop_status: r.prop_status,
      propStatus: r.prop_status,
      propOrder: r.prop_order,
      sideCount: r.side_count,
      moneyline_a: r.moneyline_a,
      moneyline_b: r.moneyline_b,
      propSideAValue: r.prop_side_a_value ?? null,
      propSideBValue: r.prop_side_b_value ?? null,
      open_time: r.open_time,
      close_time: r.close_time,
      grading_mode: r.grading_mode,
      formula_key: r.formula_key,
      formula_params: r.formula_params,
      cover_url: r.cover_url,
      propOrderByPack: r.prop_order_by_pack,
      Event: r.event_id ? [r.event_id] : [],
      Packs: r.pack_id ? [r.pack_id] : [],
    };
  }
}


