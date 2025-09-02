import { TeamsRepository } from '../contracts';
import { query } from '../../db/postgres';

export class PostgresTeamsRepository extends TeamsRepository {
  async listAll() {
    const { rows } = await query(
      `SELECT id, team_id, name, team_slug, league, emoji, logo_url
         FROM teams
         ORDER BY league, name`
    );
    return rows.map((r) => ({
      recordId: r.id,
      teamID: r.team_id || r.id,
      teamName: r.name || 'Unknown Team',
      teamNameFull: r.name || 'Unknown Team',
      teamAbbreviation: r.team_slug || '',
      teamLeague: r.league || '',
      teamType: '',
      teamLogo: [],
      teamLogoURL: r.logo_url || null,
    }));
  }
}


