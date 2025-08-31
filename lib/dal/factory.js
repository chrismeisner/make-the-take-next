// lib/dal/factory.js
import { getDataBackend } from '../runtimeConfig';
import { AirtablePropsRepository } from './airtable/props';
import { AirtablePacksRepository } from './airtable/packs';
import { AirtableTakesRepository } from './airtable/takes';
import { AirtableProfilesRepository } from './airtable/profiles';
import { PostgresPropsRepository } from './postgres/props';
import { PostgresPacksRepository } from './postgres/packs';
import { PostgresTakesRepository } from './postgres/takes';
import { PostgresProfilesRepository } from './postgres/profiles';

export function createRepositories() {
  const backend = getDataBackend();
  if (backend === 'airtable') {
    return {
      props: new AirtablePropsRepository(),
      packs: new AirtablePacksRepository(),
      takes: new AirtableTakesRepository(),
      profiles: new AirtableProfilesRepository(),
    };
  }
  if (backend === 'postgres') {
    return {
      props: new PostgresPropsRepository(),
      packs: new PostgresPacksRepository(),
      takes: new PostgresTakesRepository(),
      profiles: new PostgresProfilesRepository(),
    };
  }
  throw new Error(`[DAL] Unknown backend: ${backend}`);
}


