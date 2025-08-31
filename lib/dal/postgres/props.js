// lib/dal/postgres/props.js
import { PropsRepository } from '../contracts';
import { query } from '../../db/postgres';

export class PostgresPropsRepository extends PropsRepository {
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
    const keys = Object.keys(data);
    const vals = Object.values(data);
    const cols = keys.map((k) => k).join(', ');
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
    const { rows } = await query(`INSERT INTO props (${cols}) VALUES (${placeholders}) RETURNING *`, vals);
    return this.#map(rows[0]);
  }

  async updateMany(updates) {
    const results = [];
    for (const u of updates) {
      const { id, fields } = u;
      const keys = Object.keys(fields);
      if (keys.length === 0) continue;
      const sets = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
      const vals = keys.map((k) => fields[k]);
      vals.push(id);
      const { rows } = await query(`UPDATE props SET ${sets} WHERE id = $${keys.length + 1} RETURNING *`, vals);
      results.push(this.#map(rows[0]));
    }
    return results;
  }

  #map(r) {
    return {
      id: r.id,
      createdAt: r.created_at || null,
      propID: r.prop_id,
      prop_short: r.prop_short,
      propShort: r.prop_short,
      propTitle: r.prop_title,
      propSummary: r.prop_summary,
      prop_type: r.prop_type,
      propType: r.prop_type,
      prop_status: r.prop_status,
      propStatus: r.prop_status,
      propOrder: r.prop_order,
      sideCount: r.side_count,
      moneyline_a: r.moneyline_a,
      moneyline_b: r.moneyline_b,
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


