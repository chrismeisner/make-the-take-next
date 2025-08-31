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


