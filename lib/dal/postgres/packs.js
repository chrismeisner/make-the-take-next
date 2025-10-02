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
    const { packURL, packTitle, packSummary, packType, packLeague, packStatus, packOpenTime, packCloseTime, packCoverUrl, prize, prizeSummary, packPrizeURL, eventId, events, packID, packOpenSmsTemplate, creatorProfileId } = data || {};
    console.log('[PG PacksRepository.createOne] incoming times =>', { packOpenTime, packCloseTime });
    const { rows } = await query(
      `INSERT INTO packs (pack_url, title, summary, pack_status, league, cover_url, prize, event_id, pack_id, pack_open_time, pack_close_time, pack_open_sms_template, creator_profile_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8, COALESCE($9, LEFT(ENCODE(gen_random_bytes(9),'hex'),12)),$10,$11,$12,$13)
       ON CONFLICT (pack_url) DO UPDATE SET
         title = EXCLUDED.title,
         summary = EXCLUDED.summary,
         pack_status = EXCLUDED.pack_status,
         league = EXCLUDED.league,
         cover_url = EXCLUDED.cover_url,
         prize = EXCLUDED.prize,
         event_id = COALESCE(EXCLUDED.event_id, packs.event_id),
         pack_open_time = COALESCE(EXCLUDED.pack_open_time, packs.pack_open_time),
         pack_close_time = COALESCE(EXCLUDED.pack_close_time, packs.pack_close_time),
         pack_open_sms_template = COALESCE(EXCLUDED.pack_open_sms_template, packs.pack_open_sms_template)
       RETURNING *`,
      [packURL, packTitle || null, packSummary || null, packStatus || null, packLeague || null, packCoverUrl || null, prize || null, eventId || null, packID || null, packOpenTime || null, packCloseTime || null, packOpenSmsTemplate || null, creatorProfileId || null]
    );
    const created = this.#map(rows[0]);
    // Link multiple events if provided and Postgres supports it via packs_events
    if (Array.isArray(events) && events.length) {
      const uuidEvents = events.filter((e) => typeof e === 'string' && !e.startsWith('rec'));
      if (uuidEvents.length) {
        const values = uuidEvents.map((_, i) => `($1, $${i + 2})`).join(',');
        try {
          await query(
            `INSERT INTO packs_events (pack_id, event_id) VALUES ${values}
             ON CONFLICT (pack_id, event_id) DO NOTHING`,
            [created.id, ...uuidEvents]
          );
        } catch (e) {
          // Non-fatal
          console.warn('[PostgresPacksRepository] failed to link packs_events =>', e.message || e);
        }
      }
    }
    return created;
  }

  async updateByPackURL(packURL, fields) {
    const allowed = ['title','summary','pack_status','league','cover_url','prize','event_id','pack_open_time','pack_close_time','pack_open_sms_template'];
    const sets = [];
    const vals = [];
    let i = 1;
    console.log('[PG PacksRepository.updateByPackURL] incoming fields =>', fields);
    for (const [k,v] of Object.entries(fields || {})) {
      const col = (
        k === 'packTitle' ? 'title' :
        k === 'packSummary' ? 'summary' :
        k === 'packStatus' ? 'pack_status' :
        k === 'packLeague' ? 'league' :
        k === 'packCoverUrl' ? 'cover_url' :
        k === 'packOpenTime' ? 'pack_open_time' :
        k === 'packCloseTime' ? 'pack_close_time' :
        k === 'packOpenSmsTemplate' ? 'pack_open_sms_template' :
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
    console.log('[PG PacksRepository.updateByPackURL] updated row times =>', { pack_open_time: rows[0]?.pack_open_time, pack_close_time: rows[0]?.pack_close_time });
    return rows[0] ? this.#map(rows[0]) : null;
  }

  #map(r) {
    return {
      id: r.id,
      packID: r.pack_id,
      packURL: r.pack_url,
      packTitle: r.title,
      packSummary: r.summary,
      packStatus: r.pack_status,
      packType: r.pack_type,
      packLeague: r.league,
      firstPlace: r.first_place,
      eventTime: r.event_time || null,
      packOpenTime: r.pack_open_time || null,
      packCloseTime: r.pack_close_time || null,
      packOpenSmsTemplate: r.pack_open_sms_template || null,
      Event: r.event_id ? [r.event_id] : [],
      packPrize: r.prize,
      prizeSummary: r.prize_summary,
      packPrizeURL: r.prize_url,
      packCover: r.cover_url ? [{ url: r.cover_url, filename: 'cover' }] : [],
      creatorProfileId: r.creator_profile_id || null,
      Props: [],
      Content: [],
      Contests: [],
      Takes: [],
    };
  }
}


