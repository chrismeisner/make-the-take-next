import { EventsRepository } from '../contracts';
import { query } from '../../db/postgres';

export class PostgresEventsRepository extends EventsRepository {
  async getById(eventId) {
    const { rows } = await query(
      `SELECT e.*, 
              ht.logo_url AS home_logo,
              at.logo_url AS away_logo
         FROM events e
    LEFT JOIN teams ht ON e.home_team_id = ht.id
    LEFT JOIN teams at ON e.away_team_id = at.id
        WHERE e.id = $1
        LIMIT 1`,
      [eventId]
    );
    if (!rows.length) return null;
    const e = rows[0];
    return {
      id: e.id,
      espnGameID: e.espn_game_id || null,
      eventLeague: e.league || null,
      eventTime: e.event_time || null,
      homeTeamLogo: e.home_logo || null,
      awayTeamLogo: e.away_logo || null,
    };
  }
}


