// lib/runtimeConfig.js
// Centralized runtime configuration and backend selection

export function isProduction() {
  return process.env.NODE_ENV === 'production';
}

export function getDataBackend() {
  const value = (process.env.DATA_BACKEND || 'airtable').toLowerCase();
  return value === 'postgres' ? 'postgres' : 'airtable';
}

export function requireEnv(varName) {
  const val = process.env[varName];
  if (!val) {
    throw new Error(`[runtimeConfig] Missing required env var: ${varName}`);
  }
  return val;
}

export const RUNTIME_CONFIG = Object.freeze({
  nodeEnv: process.env.NODE_ENV || 'development',
  dataBackend: getDataBackend(),
});


