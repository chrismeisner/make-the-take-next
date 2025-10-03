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
  H2H_DEFAULT_BONUS: Number.parseInt(process.env.H2H_DEFAULT_BONUS || '0', 10),
  H2H_TIE_POLICY: (process.env.H2H_TIE_POLICY || 'split'),
  PUBLIC_BASE_URL: (process.env.NEXTAUTH_URL || ''),
});

// Feature flag to enable/disable pack sharing UI without removing code
export const PACK_SHARING_ENABLED = String(process.env.NEXT_PUBLIC_PACK_SHARING_ENABLED || 'false').toLowerCase() === 'true';


