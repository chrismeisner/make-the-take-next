// lib/dal/factory.js
// Postgres-only repositories
import { PostgresPropsRepository } from './postgres/props';
import { PostgresPacksRepository } from './postgres/packs';
import { PostgresTakesRepository } from './postgres/takes';
import { PostgresProfilesRepository } from './postgres/profiles';
import { PostgresContestsRepository } from './postgres/contests';
import { PostgresTeamsRepository } from './postgres/teams';
import { PostgresEventsRepository } from './postgres/events';
import { PostgresAwardsRepository } from './postgres/awards';
import { PostgresMetricsRepository } from './postgres/metrics';
import { PostgresPlayersRepository } from './postgres/players';

export function createRepositories() {
  return {
    props: new PostgresPropsRepository(),
    packs: new PostgresPacksRepository(),
    takes: new PostgresTakesRepository(),
    profiles: new PostgresProfilesRepository(),
    contests: new PostgresContestsRepository(),
    teams: new PostgresTeamsRepository(),
    events: new PostgresEventsRepository(),
    awards: new PostgresAwardsRepository(),
    metrics: new PostgresMetricsRepository(),
    players: new PostgresPlayersRepository(),
  };
}


