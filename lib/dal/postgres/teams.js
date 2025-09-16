import { TeamsRepository } from '../contracts';
import { query } from '../../db/postgres';

export class PostgresTeamsRepository extends TeamsRepository {
  async listAll() {
    const { rows } = await query(
      `SELECT *
         FROM teams
         ORDER BY league, name`
    );
    return rows.map((r) => ({
      recordId: r.id,
      teamID: r.team_id || r.id,
      teamName: r.name || 'Unknown Team',
      teamNameFull: r.name || 'Unknown Team',
      teamNameShort: r.short_name || null,
      teamAbbreviation: r.team_slug || '',
      teamLeague: r.league || '',
      teamType: (r.league || '').toLowerCase(),
      teamLogo: [],
      teamLogoURL: r.logo_url || null,
      teamHomeSide: Array.isArray(r.team_home_side) ? (r.team_home_side[0] || null) : (r.team_home_side || null),
      teamAwaySide: Array.isArray(r.team_away_side) ? (r.team_away_side[0] || null) : (r.team_away_side || null),
    }));
  }

  async getById(idOrTeamID) {
    const { rows } = await query(
      `SELECT *
         FROM teams
         WHERE id::text = $1 OR team_id = $1
         LIMIT 1`,
      [idOrTeamID]
    );
    const r = rows[0];
    if (!r) return null;
    return {
      recordId: r.id,
      teamID: r.team_id || r.id,
      teamName: r.name || 'Unknown Team',
      teamNameFull: r.name || 'Unknown Team',
      teamNameShort: r.short_name || null,
      teamAbbreviation: r.team_slug || '',
      teamLeague: r.league || '',
      teamType: (r.league || '').toLowerCase(),
      teamLogo: [],
      teamLogoURL: r.logo_url || null,
      teamHomeSide: Array.isArray(r.team_home_side) ? (r.team_home_side[0] || null) : (r.team_home_side || null),
      teamAwaySide: Array.isArray(r.team_away_side) ? (r.team_away_side[0] || null) : (r.team_away_side || null),
    };
  }

  async createOne(data) {
    // eslint-disable-next-line no-console
    console.log('[DAL/PostgresTeamsRepository.createOne] Upserting team', {
      teamID: data.teamID || null,
      name: data.teamName || data.teamNameFull || null,
      short_name: data.teamNameShort || null,
      team_slug: data.teamAbbreviation || data.team_slug || null,
      league: data.teamLeague || null,
      emoji: data.emoji || null,
      logo_url: data.teamLogoURL || null,
      has_team_home_side: data.teamHomeSide !== undefined && data.teamHomeSide !== null,
      has_team_away_side: data.teamAwaySide !== undefined && data.teamAwaySide !== null,
    });
    const { rows } = await query(
      `INSERT INTO teams (team_id, name, short_name, team_slug, league, emoji, logo_url, team_home_side, team_away_side)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (league, team_id) DO UPDATE SET
           name = EXCLUDED.name,
           short_name = EXCLUDED.short_name,
           team_slug = EXCLUDED.team_slug,
           emoji = EXCLUDED.emoji,
           logo_url = EXCLUDED.logo_url,
           team_home_side = COALESCE(EXCLUDED.team_home_side, teams.team_home_side),
           team_away_side = COALESCE(EXCLUDED.team_away_side, teams.team_away_side)
         RETURNING id`,
      [
        data.teamID || null,
        data.teamName || data.teamNameFull || null,
        data.teamNameShort || null,
        data.teamAbbreviation || data.team_slug || null,
        data.teamLeague || null,
        data.emoji || null,
        data.teamLogoURL || null,
        data.teamHomeSide === undefined || data.teamHomeSide === null ? null : JSON.stringify(data.teamHomeSide),
        data.teamAwaySide === undefined || data.teamAwaySide === null ? null : JSON.stringify(data.teamAwaySide),
      ]
    );
    return { id: rows[0]?.id };
  }

  async updateOne(idOrTeamID, fields) {
    const allowed = ['teamID','teamName','teamNameFull','teamNameShort','teamAbbreviation','teamLeague','emoji','teamLogoURL'];
    const sets = [];
    const values = [];
    let i = 1;
    if (fields.teamID !== undefined) { sets.push(`team_id = $${i++}`); values.push(fields.teamID); }
    if (fields.teamName !== undefined || fields.teamNameFull !== undefined) { sets.push(`name = $${i++}`); values.push(fields.teamName ?? fields.teamNameFull); }
    if (fields.teamNameShort !== undefined) { sets.push(`short_name = $${i++}`); values.push(fields.teamNameShort); }
    if (fields.teamAbbreviation !== undefined) { sets.push(`team_slug = $${i++}`); values.push(fields.teamAbbreviation); }
    if (fields.teamLeague !== undefined) { sets.push(`league = $${i++}`); values.push(fields.teamLeague); }
    if (fields.emoji !== undefined) { sets.push(`emoji = $${i++}`); values.push(fields.emoji); }
    if (fields.teamLogoURL !== undefined) { sets.push(`logo_url = $${i++}`); values.push(fields.teamLogoURL); }
    if (fields.teamHomeSide !== undefined) { sets.push(`team_home_side = $${i++}`); values.push(fields.teamHomeSide === null ? null : JSON.stringify(fields.teamHomeSide)); }
    if (fields.teamAwaySide !== undefined) { sets.push(`team_away_side = $${i++}`); values.push(fields.teamAwaySide === null ? null : JSON.stringify(fields.teamAwaySide)); }
    if (sets.length === 0) return null;
    // eslint-disable-next-line no-console
    console.log('[DAL/PostgresTeamsRepository.updateOne] Applying update', {
      idOrTeamID,
      updates: {
        teamID: fields.teamID !== undefined ? fields.teamID : undefined,
        name: (fields.teamName !== undefined || fields.teamNameFull !== undefined) ? (fields.teamName ?? fields.teamNameFull) : undefined,
        short_name: fields.teamNameShort !== undefined ? fields.teamNameShort : undefined,
        team_slug: fields.teamAbbreviation !== undefined ? fields.teamAbbreviation : undefined,
        league: fields.teamLeague !== undefined ? fields.teamLeague : undefined,
        emoji: fields.emoji !== undefined ? fields.emoji : undefined,
        logo_url: fields.teamLogoURL !== undefined ? fields.teamLogoURL : undefined,
        has_team_home_side: fields.teamHomeSide !== undefined ? (fields.teamHomeSide !== null) : undefined,
        has_team_away_side: fields.teamAwaySide !== undefined ? (fields.teamAwaySide !== null) : undefined,
      },
    });
    // Update by id OR by (league, team_id) if both provided in fields
    const whereClauses = [`id::text = $${i}`];
    if (fields.teamLeague !== undefined) {
      whereClauses.push(`(league = $${i + 1} AND team_id = $${i + 2})`);
      values.push(idOrTeamID, fields.teamLeague, fields.teamID ?? idOrTeamID);
    } else {
      whereClauses.push(`team_id = $${i + 1}`);
      values.push(idOrTeamID, idOrTeamID);
    }
    const { rows } = await query(
      `UPDATE teams SET ${sets.join(', ')}
         WHERE ${whereClauses.join(' OR ')}
         RETURNING id`,
      values
    );
    return rows[0] ? { id: rows[0].id } : null;
  }

  async deleteOne(idOrTeamID) {
    const { rowCount } = await query(
      `DELETE FROM teams WHERE id::text = $1 OR team_id = $1`,
      [idOrTeamID]
    );
    return { success: rowCount > 0 };
  }
}


