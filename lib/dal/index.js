// lib/dal/index.js
// Data Access Layer selection and shared exports

import { getDataBackend } from '../runtimeConfig';
export { airtableBase } from '../airtableBase';

export function getBackendDriver() {
  return getDataBackend();
}

export function assertBackendSupported() {
  const backend = getDataBackend();
  if (backend === 'postgres') {
    // Placeholder until Postgres repositories are implemented
    throw new Error('[DAL] Postgres backend selected but not implemented yet.');
  }
  return backend;
}


