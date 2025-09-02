// lib/dal/postgres/packs.js
import { PacksRepository } from '../contracts';
import { query } from '../../db/postgres';

export class PostgresPacksRepository extends PacksRepository {
  async getByPackURL(packURL) {
    const { rows } = await query('SELECT * FROM packs WHERE pack_url = $1 LIMIT 1', [packURL]);
    if (rows.length === 0) return null;
    const r = rows[0];
    return this.#map(r);
  }

  async createOne(data) {
    const { packURL, packTitle, packSummary, packType, packLeague, packStatus, packOpenTime, packCloseTime, packCoverUrl, prize, prizeSummary, packPrizeURL, eventId } = data || {};
    const { rows } = await query(
      `INSERT INTO packs (pack_url, title, summary, pack_status, league, cover_url, prize, event_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (pack_url) DO UPDATE SET
         title = EXCLUDED.title,
         summary = EXCLUDED.summary,
         pack_status = EXCLUDED.pack_status,
         league = EXCLUDED.league,
         cover_url = EXCLUDED.cover_url,
         prize = EXCLUDED.prize,
         event_id = COALESCE(EXCLUDED.event_id, packs.event_id)
       RETURNING *`,
      [packURL, packTitle || null, packSummary || null, packStatus || null, packLeague || null, packCoverUrl || null, prize || null, eventId || null]
    );
    return this.#map(rows[0]);
  }

  async updateByPackURL(packURL, fields) {
    const allowed = ['title','summary','pack_status','league','cover_url','prize','event_id'];
    const sets = [];
    const vals = [];
    let i = 1;
    for (const [k,v] of Object.entries(fields || {})) {
      const col = (
        k === 'packTitle' ? 'title' :
        k === 'packSummary' ? 'summary' :
        k === 'packStatus' ? 'pack_status' :
        k === 'packLeague' ? 'league' :
        k === 'packCoverUrl' ? 'cover_url' :
        k === 'prizeSummary' ? 'summary' :
        k === 'packPrizeURL' ? null : // not modeled
        k
      );
      if (col && allowed.includes(col)) {
        sets.push(`${col} = $${i++}`);
        vals.push(v);
      }
    }
    if (sets.length === 0) return null;
    vals.push(packURL);
    const { rows } = await query(`UPDATE packs SET ${sets.join(', ')} WHERE pack_url = $${i} RETURNING *`, vals);
    return rows[0] ? this.#map(rows[0]) : null;
  }

  #map(r) {
    return {
      id: r.id,
      packID: r.pack_id,
      packURL: r.pack_url,
      packTitle: r.title,
      packSummary: r.summary,
      packType: r.pack_type,
      packLeague: r.league,
      firstPlace: r.first_place,
      packOpenTime: r.open_time,
      packCloseTime: r.close_time,
      Event: r.event_id ? [r.event_id] : [],
      packPrize: r.prize,
      prizeSummary: r.prize_summary,
      packPrizeURL: r.prize_url,
      packCover: r.cover_url ? [{ url: r.cover_url, filename: 'cover' }] : [],
      Props: [],
      Content: [],
      Contests: [],
      Takes: [],
    };
  }
}


