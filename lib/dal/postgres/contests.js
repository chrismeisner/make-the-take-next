import { ContestsRepository } from '../contracts';
import { query } from '../../db/postgres';

function mapRow(r) {
  return {
    airtableId: undefined,
    contestID: r.contest_id,
    contestTitle: r.title || 'Untitled Contest',
    contestSummary: r.summary || '',
    contestPrize: r.prize || '',
    contestDetails: r.details || '',
    contestStartTime: r.start_time || null,
    contestEndTime: r.end_time || null,
    contestStatus: r.contest_status || '',
    contestCover: r.cover_url ? [{ url: r.cover_url, filename: 'contest-cover' }] : [],
    packCount: Number(r.pack_count || 0),
  };
}

export class PostgresContestsRepository extends ContestsRepository {
  async listAll() {
    const sql = `
      SELECT c.*, COALESCE(cp.pack_count, 0) AS pack_count
      FROM contests c
      LEFT JOIN (
        SELECT contest_id, COUNT(*)::int AS pack_count
        FROM contests_packs
        GROUP BY contest_id
      ) cp ON cp.contest_id = c.id
      ORDER BY c.created_at DESC
      LIMIT 100
    `;
    const { rows } = await query(sql, []);
    return rows.map(mapRow);
  }

  async getByContestID(contestID) {
    const sql = `
      SELECT c.* FROM contests c WHERE c.contest_id = $1 LIMIT 1
    `;
    const { rows } = await query(sql, [contestID]);
    if (!rows.length) return null;
    const contest = mapRow(rows[0]);

    // Fetch linked packs minimal info
    const packsSql = `
      SELECT p.id, p.pack_url, p.title, p.cover_url, p.pack_status, p.event_id
      FROM contests_packs cp
      JOIN packs p ON p.id = cp.pack_id
      WHERE cp.contest_id = $1
      LIMIT 500
    `;
    const { rows: packRows } = await query(packsSql, [rows[0].id]);
    const packs = packRows.map((p) => ({
      airtableId: p.id,
      packID: p.id,
      packTitle: p.title || 'Untitled Pack',
      packURL: p.pack_url || '',
      packCover: p.cover_url ? [{ url: p.cover_url, filename: 'cover' }] : [],
      packStatus: p.pack_status || 'Unknown',
      eventTime: null,
      propEventRollup: [],
      propsCount: 0,
    }));
    contest.packs = packs;
    return contest;
  }

  async createOne(data) {
    const { contestID, contestTitle, contestSummary, contestPrize, contestStatus, contestStartTime, contestEndTime, contestCoverUrl } = data || {};
    const sql = `
      INSERT INTO contests (contest_id, title, summary, prize, details, start_time, end_time, cover_url, contest_status)
      VALUES ($1,$2,$3,$4,NULL,$5,$6,$7,$8)
      ON CONFLICT (contest_id) DO UPDATE SET
        title = EXCLUDED.title,
        summary = EXCLUDED.summary,
        prize = EXCLUDED.prize,
        start_time = EXCLUDED.start_time,
        end_time = EXCLUDED.end_time,
        cover_url = EXCLUDED.cover_url,
        contest_status = EXCLUDED.contest_status
      RETURNING id
    `;
    const { rows } = await query(sql, [contestID, contestTitle, contestSummary, contestPrize, contestStartTime, contestEndTime, contestCoverUrl || null, contestStatus || null]);
    return { id: rows[0]?.id };
  }

  async linkPacks(contestID, packURLs) {
    // Resolve contest row
    const { rows: cRows } = await query('SELECT id FROM contests WHERE contest_id = $1 LIMIT 1', [contestID]);
    if (!cRows.length) return null;
    const cid = cRows[0].id;

    // Resolve pack IDs
    const { rows: pRows } = await query(
      `SELECT id FROM packs WHERE pack_url = ANY($1::text[])`,
      [packURLs]
    );
    const packIds = pRows.map((r) => r.id);

    // Replace links
    await query('DELETE FROM contests_packs WHERE contest_id = $1', [cid]);
    for (const pid of packIds) {
      await query('INSERT INTO contests_packs (contest_id, pack_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [cid, pid]);
    }
    return { id: cid, linked: packIds.length };
  }

  async listByPackURL(packURL) {
    const sql = `
      SELECT c.* FROM contests c
      JOIN contests_packs cp ON cp.contest_id = c.id
      JOIN packs p ON p.id = cp.pack_id
      WHERE p.pack_url = $1
      ORDER BY c.created_at DESC
      LIMIT 50
    `;
    const { rows } = await query(sql, [packURL]);
    return rows.map(mapRow);
  }
}


