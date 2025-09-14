// lib/dal/index.js
// Data Access Layer selection and shared exports

import { getDataBackend } from '../runtimeConfig';

export function getBackendDriver() {
  return getDataBackend();
}

export function assertBackendSupported() {
  const backend = getDataBackend();
  return backend;
}


