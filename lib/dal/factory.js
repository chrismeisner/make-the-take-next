// lib/dal/factory.js
import { getDataBackend } from '../runtimeConfig';
import { AirtablePropsRepository } from './airtable/props';
import { AirtablePacksRepository } from './airtable/packs';
import { AirtableTakesRepository } from './airtable/takes';
import { AirtableProfilesRepository } from './airtable/profiles';
import { AirtableContestsRepository } from './airtable/contests';
import { AirtableTeamsRepository } from './airtable/teams';
import { AirtableEventsRepository } from './airtable/events';
import { PostgresPropsRepository } from './postgres/props';
import { PostgresPacksRepository } from './postgres/packs';
import { PostgresTakesRepository } from './postgres/takes';
import { PostgresProfilesRepository } from './postgres/profiles';
import { PostgresContestsRepository } from './postgres/contests';
import { PostgresTeamsRepository } from './postgres/teams';
import { PostgresEventsRepository } from './postgres/events';

export function createRepositories() {
  const backend = getDataBackend();
  if (backend === 'airtable') {
    return {
      props: new AirtablePropsRepository(),
      packs: new AirtablePacksRepository(),
      takes: new AirtableTakesRepository(),
      profiles: new AirtableProfilesRepository(),
      contests: new AirtableContestsRepository(),
      teams: new AirtableTeamsRepository(),
      events: new AirtableEventsRepository(),
    };
  }
  if (backend === 'postgres') {
    return {
      props: new PostgresPropsRepository(),
      packs: new PostgresPacksRepository(),
      takes: new PostgresTakesRepository(),
      profiles: new PostgresProfilesRepository(),
      contests: new PostgresContestsRepository(),
      teams: new PostgresTeamsRepository(),
      events: new PostgresEventsRepository(),
    };
  }
  throw new Error(`[DAL] Unknown backend: ${backend}`);
}


