// lib/runtimeConfig.js
// Centralized runtime configuration and backend selection

export function isProduction() {
  return process.env.NODE_ENV === 'production';
}

export function getDataBackend() {
  // Enforce Postgres-only going forward
  return 'postgres';
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


