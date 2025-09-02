// lib/dal/postgres/takes.js
import { TakesRepository } from '../contracts';
import { query } from '../../db/postgres';

export class PostgresTakesRepository extends TakesRepository {
  async createLatestTake({ propID, propSide, phone, fields = {} }) {
    // Overwrite previous latest
    await query(
      `UPDATE takes SET take_status = 'overwritten'
       WHERE prop_id_text = $1 AND take_mobile = $2 AND take_status = 'latest'`,
      [propID, phone]
    );

    // Resolve pack_id via props
    let packId = null;
    try {
      const { rows } = await query('SELECT pack_id FROM props WHERE prop_id = $1 LIMIT 1', [propID]);
      packId = rows[0]?.pack_id || null;
    } catch {}

    // Create new
    const { rows } = await query(
      `INSERT INTO takes (prop_id_text, prop_side, take_mobile, take_status, pack_id)
       VALUES ($1, $2, $3, 'latest', $4) RETURNING id`,
      [propID, propSide, phone, packId]
    );
    return rows[0].id;
  }

  async countBySides(propID) {
    const { rows } = await query(
      `SELECT prop_side as side, COUNT(*) as c
       FROM takes
       WHERE prop_id_text = $1 AND take_status != 'overwritten'
       GROUP BY prop_side`,
      [propID]
    );
    const out = { A: 0, B: 0 };
    for (const r of rows) out[r.side] = Number(r.c);
    return out;
  }

  async getLatestForUser({ propID, phone }) {
    const { rows } = await query(
      `SELECT * FROM takes
       WHERE prop_id_text = $1 AND take_mobile = $2 AND take_status = 'latest'
       ORDER BY created_at DESC LIMIT 1`,
      [propID, phone]
    );
    return rows[0] || null;
  }

  async listLatestForPhone(phone) {
    const { rows } = await query(
      `SELECT * FROM takes
       WHERE take_mobile = $1 AND take_status = 'latest'
       ORDER BY created_at DESC LIMIT 5000`,
      [phone]
    );
    return rows.map((r) => ({
      id: r.id,
      takeID: r.id,
      propID: r.prop_id_text,
      takeMobile: r.take_mobile,
      takeStatus: r.take_status,
      takeResult: r.take_result || null,
      packs: [],
      propSide: r.prop_side,
    }));
  }
}


